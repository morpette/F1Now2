# Plan: F1 Driver Flow Actions (Integration Hub)

## Context

F1Now1 currently has a Driver table and security model, but no automation layer. This plan adds 10 custom Flow Actions (Integration Hub Actions) that fetch driver data from f1api.dev, covering every driver-related endpoint in the API. These actions are "building blocks" — they output data pills for use in future Flows and Subflows, but no flows are being built yet.

---

## Architecture Decisions

### Script approach
Each action uses `actionStep.script` with `required_run_time: 'instance'`, calling f1api.dev via `sn_ih.RESTMessageV2` in a shared external script file loaded via `Now.include`. A single shared base URL constant is referenced in each script.

### Outputs
Every action returns three outputs:
- `response_body` (`StringColumn`, `maxLength: 65536`) — raw JSON from f1api.dev
- `status_code` (`IntegerColumn`) — HTTP status code
- `error_message` (`StringColumn`) — empty on success, populated on exception

Raw JSON is the correct choice here: the OpenAPI spec doesn't define exact response field schemas, and consuming flows can parse the body via a Script step. This matches the Integration Hub spoke pattern.

### No Connection Alias (for now)
f1api.dev is a public unauthenticated API. A Connection Alias is best practice in ServiceNow but adds setup complexity for what is currently a training project. The base URL is defined once as a constant inside each script step. It can be refactored to a Connection Alias later.

### File layout
Actions go in `src/fluent/actions/` (per SDK convention). Each action includes its script inline inside the `actionStep.script` call via `Now.include`, pointing to a shared scripts directory.

```
src/fluent/actions/
  f1-get-all-drivers.now.ts
  f1-get-driver-by-id.now.ts
  f1-search-drivers.now.ts
  f1-get-drivers-by-season.now.ts
  f1-get-driver-season-results.now.ts
  f1-get-current-season-drivers.now.ts
  f1-get-current-driver-results.now.ts
  f1-get-team-drivers-by-season.now.ts
  f1-get-team-current-drivers.now.ts
  f1-compare-drivers.now.ts
  scripts/
    f1-get-all-drivers.js
    f1-get-driver-by-id.js
    f1-search-drivers.js
    f1-get-drivers-by-season.js
    f1-get-driver-season-results.js
    f1-get-current-season-drivers.js
    f1-get-current-driver-results.js
    f1-get-team-drivers-by-season.js
    f1-get-team-current-drivers.js
    f1-compare-drivers.js
```

### keys.ts
`keys.ts` is auto-generated on `npm run build`. No manual edits needed — all `Now.ID['...']` references in the new action files will get sys_ids auto-assigned on first build.

---

## The 10 Actions

| # | Action Name | Endpoint | Required Inputs | Optional Inputs |
|---|-------------|----------|-----------------|-----------------|
| 1 | Get All Drivers | `GET /api/drivers` | — | `limit`, `offset` |
| 2 | Get Driver by ID | `GET /api/drivers/{driverId}` | `driver_id` | — |
| 3 | Search Drivers | `GET /api/drivers/search` | — | `query`, `limit`, `offset` |
| 4 | Get Drivers by Season | `GET /api/{year}/drivers` | `year` | `limit`, `offset` |
| 5 | Get Driver Season Results | `GET /api/{year}/drivers/{driverId}` | `year`, `driver_id` | `limit`, `offset` |
| 6 | Get Current Season Drivers | `GET /api/current/drivers` | — | `limit`, `offset` |
| 7 | Get Current Season Driver Results | `GET /api/current/drivers/{driverId}` | `driver_id` | `limit`, `offset` |
| 8 | Get Team Drivers by Season | `GET /api/{year}/teams/{teamId}/drivers` | `year`, `team_id` | `limit`, `offset` |
| 9 | Get Team Current Season Drivers | `GET /api/current/teams/{teamId}/drivers` | `team_id` | `limit`, `offset` |
| 10 | Compare Two Drivers | `GET /api/{year}/compare/{driverId1}/{driverId2}` | `year`, `driver_id_1`, `driver_id_2` | — |

All actions share the same output schema: `response_body`, `status_code`, `error_message`.

---

## Code Pattern

### Action file (representative example: Get Driver by ID)

```typescript
// src/fluent/actions/f1-get-driver-by-id.now.ts
import { Action, wfa, actionStep } from '@servicenow/sdk/automation'
import { IntegerColumn, StringColumn } from '@servicenow/sdk/core'

export const f1GetDriverById = Action(
  {
    $id: Now.ID['f1-action-get-driver-by-id'],
    name: 'F1: Get Driver by ID',
    description: 'Fetch F1 driver profile from f1api.dev by driver ID (e.g. "max_verstappen")',
    category: 'f1_data',
    inputs: {
      driver_id: StringColumn({ label: 'Driver ID', mandatory: true }),
    },
    outputs: {
      response_body: StringColumn({ label: 'Response Body', maxLength: 65536 }),
      status_code:   IntegerColumn({ label: 'Status Code' }),
      error_message: StringColumn({ label: 'Error Message', maxLength: 1000 }),
    },
  },
  (params) => {
    const call = wfa.actionStep(
      actionStep.script,
      { $id: Now.ID['f1-step-get-driver-by-id'], label: 'GET /api/drivers/{driverId}' },
      {
        required_run_time: 'instance',
        script: Now.include('./scripts/f1-get-driver-by-id.js'),
        inputVariables: {
          driver_id: { label: 'Driver ID', value: wfa.dataPill(params.inputs.driver_id, 'string') },
        },
        outputVariables: {
          response_body: StringColumn({ label: 'Response Body', maxLength: 65536 }),
          status_code:   IntegerColumn({ label: 'Status Code' }),
          error_message: StringColumn({ label: 'Error Message', maxLength: 1000 }),
        },
        errorHandlingType: 'dont_stop_the_action',
      }
    )

    wfa.assignActionOutputs(params.outputs, {
      response_body: wfa.dataPill(call.response_body, 'string'),
      status_code:   wfa.dataPill(call.status_code, 'integer'),
      error_message: wfa.dataPill(call.error_message, 'string'),
    })
  }
)
```

### Corresponding script file

```javascript
// src/fluent/actions/scripts/f1-get-driver-by-id.js
var BASE_URL = 'https://api.f1api.dev';
try {
    var rm = new sn_ih.RESTMessageV2();
    rm.setEndpoint(BASE_URL + '/api/drivers/' + inputs.driver_id);
    rm.setHttpMethod('GET');
    var response = rm.execute();
    outputs.status_code   = response.getStatusCode();
    outputs.response_body = response.getBody();
    outputs.error_message = '';
} catch (e) {
    outputs.status_code   = 0;
    outputs.response_body = '';
    outputs.error_message = String(e.message);
}
```

### Pagination scripts (actions 1, 3, 4, 5, 6, 7, 8, 9)
Scripts that support `limit`/`offset` build a query string:
```javascript
var qs = [];
if (inputs.limit)  qs.push('limit='  + inputs.limit);
if (inputs.offset) qs.push('offset=' + inputs.offset);
var url = BASE_URL + '/api/drivers' + (qs.length ? '?' + qs.join('&') : '');
```

---

## Implementation Steps

1. Create `src/fluent/actions/scripts/` directory
2. Write all 10 `.js` script files in `scripts/`
3. Write all 10 `.now.ts` action files in `src/fluent/actions/`
4. Run `npm run build` — auto-populates `keys.ts` with new sys_ids
5. Run `npm run deploy` — installs actions on the connected instance

---

## Verification

After deploy, in Flow Designer on the instance:
- Navigate to **Process Automation > Flow Designer > Action Designer**
- Filter by application `x_1912467_f1now1` — all 10 actions should appear under category `f1_data`
- Open one action, click **Test**, supply a `driver_id` (e.g. `max_verstappen`) and verify `response_body` contains valid JSON and `status_code` is `200`
