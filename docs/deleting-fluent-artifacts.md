# Deleting Fluent Artifacts & Cleaning Up Orphans

A playbook for **Claude Code** working in this repo (`x_1912467_f1now1`). It captures the
process used to remove a set of non-working Custom Actions (Flow Designer actions that fetched
driver data from f1api.dev) and to clean up everything they left behind.

Read this whenever the task is "delete some Fluent artifact and make sure it's gone from the
instance too," or "clean up orphaned/leftover records," or "prune `keys.ts`."

## Key facts to load first

- Scope: `x_1912467_f1now1` — scopeId / `sys_scope` = `6f37cd14937d8b14a03577f08bba1032`
- Default auth alias used for deploy/query: `Proton Admin` (admin@dev387048). Check with `now-sdk auth --list`.
- Commands: `npm run build` (`now-sdk build`), `npm run deploy` (`now-sdk install`), `now-sdk query <table>`.
- The safety net for every change here is **`npm run build` (and `now-sdk build --frozenKeys`)** —
  if you break `keys.ts` or leave a dangling reference, the build fails. Always rebuild after editing.

## Mental model: two classes of records

1. **Fluent source artifacts** — defined by `.now.ts` files (and their `keys.ts` identities).
   Deleted by *removing the source*; the SDK tracks the deletion automatically.
2. **Runtime-generated artifacts** — e.g. action-type *snapshots* (`sys_hub_action_type_snapshot`)
   and their child rows. These are created by the platform when an action is published, are **not**
   in source, and are **not** removed by deleting the source. They become orphans and must be
   deleted explicitly with `Now.del`.

`keys.ts` is a third thing: the identity registry. The build does **not** auto-prune it when
source is removed, so stale entries linger until manually pruned.

---

## Part 1 — Delete a Fluent-created artifact (the canonical path)

Authoritative SDK guidance (`now-sdk explain now-del-guide`):
> For records created in Fluent, prefer removing the code instead of using `Now.del()`.
> Deletes are tracked automatically when you remove a record definition.

Steps:

1. **Find the source and its blast radius.**
   ```bash
   find src -name "*.now.ts" | xargs grep -l "<thing>"
   # confirm nothing else imports the exports you're about to delete:
   grep -rn "<exportName>" --include="*.ts" src | grep -v "<the files being deleted>"
   # confirm no flows/instances depend on it (see Part 2 reference check)
   ```

2. **Remove the source files** (and any co-located includes like `scripts/`).
   ```bash
   rm -rf src/fluent/actions   # example: removed the whole actions dir + scripts/
   ```

3. **Build.** The SDK writes `action="DELETE"` records into `dist/app/author_elective_update/`.
   ```bash
   npm run build
   ls dist/app/author_elective_update/*.xml | wc -l       # how many records marked
   grep -l 'action="DELETE"' dist/app/author_elective_update/*.xml | wc -l   # should match
   ```

4. **Deploy.** Records are removed from the instance. The output prints a **rollback URL** — keep it.
   ```bash
   npm run deploy
   ```

5. **Verify on the instance** (don't trust the build alone):
   ```bash
   now-sdk query sys_hub_action_type_definition --query "sys_scope=6f37cd14937d8b14a03577f08bba1032"
   # expect: Retrieved 0 record(s)
   ```

> Note: removing the source does **not** prune `keys.ts` (Part 3) and does **not** delete runtime
> snapshots (Part 2). Both survived this exact operation and had to be cleaned separately.

---

## Part 2 — Clean up orphaned runtime records (snapshots)

After deleting the actions, ~262 hub records + ~412 peripheral rows were orphaned. Pattern repeats
for anything that publishes snapshots.

### 2a. Investigate — confirm they're really orphaned

Query the relevant tables in scope and confirm **nothing references them**:

```bash
SCOPE=6f37cd14937d8b14a03577f08bba1032
now-sdk query sys_hub_action_type_snapshot --query "sys_scope=$SCOPE"   # the orphan snapshots
now-sdk query sys_hub_action_instance      --query "sys_scope=$SCOPE"   # uses of actions -> expect 0
now-sdk query sys_hub_flow                 --query "sys_scope=$SCOPE"   # flows           -> expect 0
now-sdk query sys_hub_flow_snapshot        --query "sys_scope=$SCOPE"   # flow snapshots  -> expect 0
```
If the reference tables are all `0`, the snapshots and their children are dead weight.

The full orphan graph for actions spans these tables (all keyed by `sys_scope`):
`sys_hub_action_type_snapshot`, `sys_hub_action_input`, `sys_hub_action_output`,
`sys_hub_step_instance`, `sys_hub_step_ext_input`, `sys_hub_step_ext_output`,
plus peripheral rows in `sys_documentation`, `sys_element_mapping`, `sys_variable_value`.

### ⚠️ Gotchas that matter

- **`now-sdk query` caps at 100 rows by default.** Use `--limit 2000 --fields sys_id,...` to get
  complete results, or `--offset` to page. A "100" result almost always means *truncated*.
- **Peripheral tables are SHARED with real artifacts and with unrelated platform features.**
  `sys_documentation`, `sys_element_mapping`, and `sys_variable_value` in this scope contained
  2000+ rows belonging to the driver table, ATF, process-automation, flow-step definitions, etc.
  **Never delete all rows in scope for these tables.** Match precisely (next step).
- The 6 *hub* tables (`sys_hub_action_*`, `sys_hub_step_*`) only ever held these actions in this
  app, so everything in them in-scope is orphaned and safe to delete wholesale.

### 2b. Build the precise target set

1. Collect every `sys_id` from the 6 hub tables (all orphaned).
2. The **model ids** = snapshot ids ∪ step-instance ids. Peripheral rows reference these:
   - `sys_documentation.name` = `var__m_sys_hub_<...>_<modelId>` → keep only `name=x_1912467_f1now1_driver`.
   - `sys_element_mapping.id` ∈ model ids (its `key.table` is `var__m_sys_hub_...`).
   - `sys_variable_value.document_key` ∈ model ids.
3. Query the two huge tables *targeted*, not wholesale:
   ```bash
   MODELS="<comma-separated snapshot ids + step-instance ids>"
   now-sdk query sys_element_mapping --query "sys_scope=$SCOPE^idIN$MODELS"          --limit 2000 --fields sys_id,table,id
   now-sdk query sys_variable_value  --query "sys_scope=$SCOPE^document_keyIN$MODELS" --limit 2000 --fields sys_id,document_key
   ```
   For `sys_documentation`, fetch all in scope (it was only ~236 here) and filter by name prefix
   `var__m_sys_hub_` whose trailing 32-hex is in the model-id set.

### 2c. Delete via a one-time `Now.del` Fluent file

These are **not** source records, so removing source won't help — use `Now.del(table, sysId)`.

- Generate `src/fluent/cleanup-orphaned-snapshots.now.ts` programmatically (one `Now.del('<table>', '<sys_id>')`
  per row; `Now` is global, no import needed; statements are top-level only).
- Order children before parents (outputs/inputs/ext/docs/mappings/values → step_instance → snapshot).
  Order isn't strictly required for sys_id deletes, but it's tidy.
- `npm run build` (check the `action="DELETE"` count) → `npm run deploy` (save the rollback URL).
- **Verify each table is back to 0** in scope, and confirm a real artifact survived
  (`sys_documentation` `name=x_1912467_f1now1_driver` should still return rows).
- **Remove the one-time file and rebuild** so the project doesn't carry hundreds of dead `Now.del`
  statements:
  ```bash
  rm -f src/fluent/cleanup-orphaned-snapshots.now.ts && npm run build
  ```

---

## Part 3 — Prune `keys.ts`

`src/fluent/generated/keys.ts` is the identity registry. It is **not** auto-pruned when source or
records are deleted, so it accumulates stale entries (here: ~3266 → ~401 lines after pruning).

Structure:
- `explicit: { ... }` — members keyed by name/sys_id, each `{ table, id }`. Interface members,
  **no commas** between them.
- `composite: [ ... ]` — array of `{ table, id, key }` objects, comma-separated. The first
  `table:` in each block is the top-level table; nested `key.table` (e.g. `var__m_sys_hub_...`)
  is *inside* `sys_element_mapping` blocks.

### Do it with a brace-depth parser, not regex-per-line

Naive line deletion corrupts the nested `key: { ... }` blocks. Group members by tracking
`{`/`[` vs `}`/`]` depth, then keep/remove whole blocks. Removal rules used here:

- **explicit:** drop keys starting `f1-action-` / `f1-step-`.
- **composite:** drop blocks whose top-level `table` ∈
  `{sys_hub_action_type_definition, sys_hub_step_instance, sys_hub_action_input,
  sys_hub_action_output, sys_hub_step_ext_input, sys_hub_step_ext_output, sys_variable_value}`;
  drop `sys_documentation` blocks whose `name` starts `var__m_sys_hub_`;
  drop `sys_element_mapping` blocks containing `table: 'var__m_sys_hub_`.
- **Keep** everything else: `sys_dictionary`, driver `sys_documentation` (`x_1912467_f1now1_driver`),
  `sys_ui_list*`, `sys_ui_section`, `sys_db_object`, `sys_security_acl*`, `sys_user_role`,
  `sys_embedded_help_role`, `sys_module`, `ua_table_licensing_config`.

### Validate

```bash
grep -c "f1-action\|f1-step\|sys_hub_\|var__m_sys_hub\|sys_variable_value\|sys_element_mapping" src/fluent/generated/keys.ts  # expect 0
npm run build                 # must pass (catches syntax + dangling refs)
now-sdk build --frozenKeys    # CI key-consistency check; must pass
```
If `--frozenKeys` fails, you removed a key something still references — restore it.

---

## Quick reference: order of operations

1. Delete Fluent source → `build` → `deploy` → verify 0 on instance. (Part 1)
2. Investigate orphaned runtime snapshots; confirm 0 references. (Part 2a)
3. Precisely match orphans (mind the 100-row cap and shared peripheral tables). (Part 2b)
4. One-time `Now.del` file → `build` → `deploy` → verify 0 → delete file → `build`. (Part 2c)
5. Prune `keys.ts` with a brace-depth parser → `build` → `build --frozenKeys`. (Part 3)

Every deploy prints a rollback URL (`sys_rollback_context.do?sys_id=...`) — record it before moving on.
