# REST Message + Thin Action Pattern

How F1Now1 calls external HTTP APIs (e.g. `f1api.dev`) as reusable Flow building
blocks. This is the **standard approach** for outbound REST in this project —
follow it whenever you add new API-backed Actions.

---

## Why this pattern (the key constraint)

The ServiceNow Fluent SDK **has no REST step for custom Actions.** The typed
`actionStep.*` catalog only offers `script`, record CRUD (`createRecord`,
`updateRecord`, `lookUpRecord(s)`, …), `email`, `sms`, `notification`,
`askForApproval`, `waitFor*`, etc. The OOB Flow Designer "REST" step you see in
the Action Designer UI is **not** modelled by the SDK and **cannot** be
referenced by sys_id either (OOB step definitions aren't queryable
`sys_hub_action_type_definition` records — those records are *Actions*, not
*Steps*).

So the idiomatic, source-driven way to do outbound REST is:

1. **A `RestMessage`** (`sys_rest_message` + `sys_rest_message_fn`) — the
   declarative HTTP definition: base URL, headers, and one **function per
   endpoint** with `${var}` path substitution and query params. No script.
2. **A thin custom `Action`** per endpoint — typed inputs/outputs plus a single
   minimal `actionStep.script` ("thin invoker") that calls the REST Message
   function via `sn_ws.RESTMessageV2(...)` and surfaces the raw response.

The HTTP detail lives in the REST Message (declarative); the Action is just the
flow-facing building block that wires inputs to `${vars}` and returns the
result.

```
Flow / Subflow
   └─ calls →  Custom Action  (typed inputs + outputs)
                  └─ contains →  thin Script Step
                                    └─ runs →  RESTMessageV2('<Message>', '<function>')
                                                  └─ defined in →  RestMessage
```

---

## File layout

```
src/fluent/
  integrations/
    f1-api-driver-endpoints.now.ts     # one RestMessage, scoped to a group of endpoints
  actions/
    f1-get-driver-by-id.now.ts         # one thin Action per endpoint
    f1-...now.ts
    scripts/
      f1-get-driver-by-id.js           # the thin invoker for each Action
      f1-...js
```

- **One `RestMessage` per logical endpoint group**, not one giant message.
  F1Now1 dedicates `F1 API Driver Endpoints` to driver endpoints only; races,
  standings, etc. each get their own RestMessage file. This keeps each message
  focused and easy to manage.
- `*.now.ts` files are Fluent artifacts (picked up by the `**/*.now.ts` glob
  under `src/fluent`). The `.js` files are plain scripts pulled in via
  `Now.include('./scripts/...')` — they are **not** artifacts themselves.

---

## Step 1 — The REST Message

`src/fluent/integrations/<group>.now.ts`

```typescript
import '@servicenow/sdk/global'
import { RestMessage } from '@servicenow/sdk/core'

RestMessage({
    $id: Now.ID['f1-api-msg'],
    name: 'F1 API Driver Endpoints',          // case-sensitive, max 40 chars; 1st arg to RESTMessageV2
    endpoint: 'https://f1api.dev',            // base URL
    description: 'Outbound REST integration with the public f1api.dev API — driver endpoints.',
    authenticationType: 'noAuthentication',   // public API; use 'basic' | 'oauth2' otherwise
    headers: [{ $id: Now.ID['f1-api-header-accept'], name: 'Accept', value: 'application/json' }],
    functions: [
        // Path identifier → ${var} in the endpoint
        {
            name: 'getDriverById',            // case-sensitive; 2nd arg to RESTMessageV2; unique in message
            httpMethod: 'GET',                // uppercase; platform stores lowercase
            endpoint: 'https://f1api.dev/api/drivers/${driverId}',  // full URL override (per function)
            variables: [{ $id: Now.ID['f1-fn-byid-var-driverid'], name: 'driverId' }],
        },
        // Pagination / filters → query params
        {
            name: 'getAllDrivers',
            httpMethod: 'GET',
            endpoint: 'https://f1api.dev/api/drivers',
            variables: [
                { $id: Now.ID['f1-fn-all-var-limit'], name: 'limit' },
                { $id: Now.ID['f1-fn-all-var-offset'], name: 'offset' },
            ],
            queryParams: [
                { $id: Now.ID['f1-fn-all-qp-limit'], name: 'limit', value: '${limit}', order: 1 },
                { $id: Now.ID['f1-fn-all-qp-offset'], name: 'offset', value: '${offset}', order: 2 },
            ],
        },
    ],
})
```

Rules that matter:

- **Path identifiers** (e.g. `{driverId}`) → `${var}` in the function `endpoint`
  + a matching entry in `variables`.
- **Pagination / filters** (`limit`, `offset`, `q`, …) → `queryParams` with
  `value: '${var}'` + a matching `variables` entry. Appended as `?key=value`.
- Every `${var}` used anywhere must be declared in that function's `variables`.
- `httpMethod` is always uppercase (`'GET'`, `'POST'`, …).
- Function `endpoint` is a **full URL override** — there's no "append path to
  base" behaviour, so set the complete URL on each function.
- Every record (`RestMessage`, headers, `variables`, `queryParams`) needs a
  unique `$id: Now.ID['...']`. Only `functions` are keyed by `name` (coalesce).

---

## Step 2 — The thin invoker script

`src/fluent/actions/scripts/<action>.js`

```javascript
/**
 * Thin invoker for REST function `getDriverById` (GET /api/drivers/{driverId}).
 */
(function execute(inputs, outputs) {
    try {
        var rm = new sn_ws.RESTMessageV2('F1 API Driver Endpoints', 'getDriverById');
        rm.setStringParameterNoEscape('driverId', inputs.driver_id);      // path var
        rm.setStringParameterNoEscape('limit', String(inputs.limit));     // query var (number → String)
        var response = rm.execute();
        outputs.status_code = response.getStatusCode();
        outputs.response_body = response.getBody();
        outputs.error_message = '';
    } catch (ex) {
        outputs.status_code = 0;
        outputs.response_body = '';
        outputs.error_message = '' + ex;
    }
})(inputs, outputs);
```

- Use the `(function execute(inputs, outputs) { … })(inputs, outputs)` wrapper —
  the Flow Designer script-step convention. `inputs.*` are the step's
  `inputVariables`; set results on `outputs.*` (the step's `outputVariables`).
- Always `setStringParameterNoEscape(name, value)` — `setStringParameter()`
  XML-escapes and corrupts JSON.
- `String(...)` numeric inputs (limit/offset/year) before passing them.
- Keep it minimal: set vars, `execute()`, capture `status_code` /
  `response_body` / `error_message`. The `try/catch` means the step never
  throws — the Action always returns a usable result.

---

## Step 3 — The thin Action

`src/fluent/actions/<action>.now.ts`

```typescript
import '@servicenow/sdk/global'
import { Action, wfa, actionStep } from '@servicenow/sdk/automation'
import { IntegerColumn, StringColumn } from '@servicenow/sdk/core'

export const f1GetDriverById = Action(
    {
        $id: Now.ID['f1-action-get-driver-by-id'],
        name: 'F1: Get Driver by ID',
        description: 'Fetch a single F1 driver from f1api.dev (GET /api/drivers/{driverId}).',
        category: 'f1_data',                          // groups the Action in Action Designer
        inputs: {
            driver_id: StringColumn({ label: 'Driver ID', mandatory: true, hint: 'e.g. max_verstappen' }),
            // pagination inputs carry defaults so query vars are always populated:
            // limit: IntegerColumn({ label: 'Limit', default: 30, min: 1, max: 100 }),
            // offset: IntegerColumn({ label: 'Offset', default: 0, min: 0, max: 10000 }),
        },
        outputs: {                                    // standard output triple — keep consistent
            response_body: StringColumn({ label: 'Response Body', maxLength: 65536 }),
            status_code: IntegerColumn({ label: 'Status Code' }),
            error_message: StringColumn({ label: 'Error Message', maxLength: 1000 }),
        },
    },
    (params) => {
        const call = wfa.actionStep(
            actionStep.script,
            { $id: Now.ID['f1-step-get-driver-by-id'], label: 'Invoke F1 API getDriverById' },
            {
                required_run_time: 'instance',
                script: Now.include('./scripts/f1-get-driver-by-id.js'),
                inputVariables: {
                    // map Action inputs → step inputs (consumed as inputs.* in the .js)
                    driver_id: { label: 'Driver ID', value: wfa.dataPill(params.inputs.driver_id, 'string') },
                },
                outputVariables: {
                    // must match what the .js sets on outputs.*
                    response_body: StringColumn({ label: 'Response Body', maxLength: 65536 }),
                    status_code: IntegerColumn({ label: 'Status Code' }),
                    error_message: StringColumn({ label: 'Error Message', maxLength: 1000 }),
                },
                errorHandlingType: 'dont_stop_the_action',
            },
        )

        // map step outputs → Action outputs (the data pills future flows consume)
        wfa.assignActionOutputs(params.outputs, {
            response_body: wfa.dataPill(call.response_body, 'string'),
            status_code: wfa.dataPill(call.status_code, 'integer'),
            error_message: wfa.dataPill(call.error_message, 'string'),
        })
    },
)
```

Rules that matter:

- **Standard output triple** on every Action: `response_body` (raw JSON,
  `maxLength: 65536`), `status_code` (integer), `error_message` (string). Raw
  JSON out keeps Actions generic — consuming flows parse the body.
- `inputVariables` value types via `wfa.dataPill(pill, 'string' | 'integer' | …)`.
- The step's `outputVariables` must match the keys the `.js` sets on `outputs.*`.
- **Pagination inputs get defaults** (`limit` 30, `offset` 0) so the query
  `${vars}` are always substituted — an unset var would send `?limit=` (empty).
  Required path identifiers are `mandatory: true` with no default.
- `errorHandlingType: 'dont_stop_the_action'` — surface the error via outputs
  rather than failing the calling flow.
- `category` should be shared across a group (F1Now1 uses `f1_data`) so the
  Actions cluster together in Action Designer.

---

## Naming conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| RestMessage `name` | `F1 API <Group> Endpoints` | `F1 API Driver Endpoints` |
| RestMessage function `name` | camelCase verb | `getDriverById`, `searchDrivers` |
| Action `name` | `F1: <Title Case>` | `F1: Get Driver by ID` |
| Action `category` | shared per group | `f1_data` |
| Integration file | kebab of group | `f1-api-driver-endpoints.now.ts` |
| Action file | kebab of action | `f1-get-driver-by-id.now.ts` |
| Script file | matches its Action | `scripts/f1-get-driver-by-id.js` |
| `$id` keys | kebab, prefixed, **globally unique** | `f1-action-get-driver-by-id`, `f1-step-...`, `f1-fn-...`, `f1-fn-...-qp-...` |

`$id` keys are hashed to sys_ids at build time and registered in
`src/fluent/generated/keys.ts` automatically — **don't edit `keys.ts` by hand**.
Renaming a `name` while keeping the same `$id` updates the existing record (no
sys_id churn); changing the `$id` creates a new record.

---

## Build, deploy, verify

```bash
npm run build      # compile Fluent sources; auto-populates keys.ts
npm run deploy     # install/update on the connected instance
```

Spot-check the build output before deploy:

```bash
grep -h "<name>" dist/app/update/sys_rest_message_*.xml          # message name
grep -rho "RESTMessageV2('[^']*', '[^']*')" dist/app/update/     # every invocation
```

Verify on the instance after deploy (read-only queries):

```bash
npx now-sdk query sys_rest_message -q "name=F1 API Driver Endpoints" -f "name,rest_endpoint" -o json
npx now-sdk query sys_rest_message_fn -q "rest_message.name=F1 API Driver Endpoints" -f "function_name,http_method" -o json
npx now-sdk query sys_hub_action_type_definition -q "sys_scope.scope=x_1912467_f1now1^categoryISNOTEMPTY" -f "name" -o json
```

Functional test: **Flow Designer → Action Designer**, filter app
`x_1912467_f1now1`, open an Action, click **Test**, supply inputs (e.g.
`driver_id = max_verstappen`) and confirm `status_code = 200` with JSON in
`response_body`. (`F1: Get All Drivers` and `F1: Search Drivers` were validated
this way.)

---

## Adding a new endpoint group (checklist)

1. Create `src/fluent/integrations/f1-api-<group>-endpoints.now.ts` with a new
   `RestMessage` (`name: 'F1 API <Group> Endpoints'`) and one function per
   endpoint.
2. For each endpoint, add `src/fluent/actions/f1-<action>.now.ts` +
   `src/fluent/actions/scripts/f1-<action>.js` from the templates above.
3. Use a fresh, globally-unique `$id` for every record; reuse the standard
   output triple and a shared `category`.
4. `npm run build`, spot-check, `npm run deploy`, then test in Action Designer.
```
