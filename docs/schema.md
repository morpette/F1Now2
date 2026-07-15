# Application Schema

## Tables

### Driver (`x_1912467_f1now1_driver`)

Source: `src/fluent/generated/data/table/sys_db_object_1ec74194937d8b14a03577f08bba10ad.now.ts`

| Column | Type | Label | Notes |
|--------|------|-------|-------|
| `name` | StringColumn | Name | Max 40 chars |
| `surname` | StringColumn | Surname | Max 40 chars |
| `driver_id` | StringColumn | Driver ID | API slug, e.g. "max_verstappen". Max 60 chars |
| `abbreviation` | StringColumn | Abbreviation | 3-letter code, e.g. "VER". Max 3 chars |
| `number` | IntegerColumn | Number | Driver's race number |
| `nationality` | StringColumn | Nationality | Country name, e.g. "Dutch". Max 50 chars |
| `date_of_birth` | DateColumn | Date of Birth | ISO date, e.g. "1997-09-30" |

Data sourced from the F1 API (`f1api.dev`). See `docs/F1api.dev/openapi.yaml` for available endpoints.

## Roles

| Role | Label | Access |
|------|-------|--------|
| `x_1912467_f1now1.admin` | Admin | Create, read, update records |
| `x_1912467_f1now1.user` | User | Read access (default user role) |
