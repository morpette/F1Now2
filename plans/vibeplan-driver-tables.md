# ServiceNow Driver Table Implementation Plan

## Overview
This plan outlines the creation of a comprehensive Driver table in ServiceNow to store all Formula 1 driver data from the F1 API (f1api.dev). The design supports core driver identity, seasonal participation, team affiliations, and performance metrics.

**Integration Architecture**: This implementation will use **ServiceNow REST Messages** for outbound API calls to f1api.dev, combined with **IntegrationHub Custom Actions** that orchestrate these REST Message calls into reusable, testable components.

---

## 1. Table Architecture

### 1.1 Primary Tables

#### `driver` [f1now2.driver]
**Purpose**: Master record for each F1 driver across all time

| Field Name | Type | Max Length | Mandatory | Description | API Source |
|------------|------|------------|-----------|-------------|------------|
| `name` | string | 120 | Yes | Driver's full name | `/api/drivers`, `/api/drivers/search` |
| `driver_id` | string | 40 | Yes | External API identifier (primary key) | All driver endpoints |
| `first_name` | string | 60 | No | Driver's first name | Inferred from search by name/surname |
| `last_name` | string | 60 | No | Driver's last name | Inferred from search by name/surname |
| `short_name` | string | 20 | No | Abbreviated name (e.g., "HAM") | Typical F1 data |
| `date_of_birth` | date | - | No | Driver's birth date | Typical F1 data |
| `nationality` | string | 40 | No | Driver's nationality | Typical F1 data |
| `permanent_number` | integer | - | No | Driver's permanent race number | Typical F1 data |
| `bio` | string | 4000 | No | Driver biography/description | Typical F1 data |
| `url` | string | 255 | No | Driver's official URL or image | Typical F1 data |
| `active` | boolean | - | No | Currently active in F1 | Derived from current season |
| `sys_created_on` | datetime | - | Yes | Record creation timestamp | ServiceNow |
| `sys_updated_on` | datetime | - | Yes | Last update timestamp | ServiceNow |

**Indexes**:
- `driver_id` (unique)
- `name`
- `last_name`
- `active`

**Table Properties**:
- Extends: cmdb_ci (or create as custom table `f1now2.driver`)
- Access: Public read, restricted write

---

#### `season` [f1now2.season]
**Purpose**: Master record for each F1 season (referenced by driver-season relationships)

| Field Name | Type | Max Length | Mandatory | Description | API Source |
|------------|------|------------|-----------|-------------|------------|
| `year` | integer | - | Yes | Season year (1950-present) | `/api/seasons`, `/api/{year}` |
| `season_id` | string | 40 | Yes | External API season identifier | API endpoints |
| `name` | string | 100 | No | Season display name | Typical F1 data |
| `sys_created_on` | datetime | - | Yes | Record creation timestamp | ServiceNow |

**Indexes**:
- `year` (unique)
- `season_id` (unique)

---

#### `team` [f1now2.team]
**Purpose**: Master record for each F1 team

| Field Name | Type | Max Length | Mandatory | Description | API Source |
|------------|------|------------|-----------|-------------|------------|
| `team_id` | string | 40 | Yes | External API identifier | `/api/teams`, `/api/teams/{teamId}` |
| `name` | string | 100 | Yes | Team name | API endpoints |
| `full_name` | string | 120 | No | Full team name | Typical F1 data |
| `nationality` | string | 40 | No | Team nationality | Typical F1 data |
| `constructor` | boolean | - | No | Is a constructor team | Typical F1 data |
| `url` | string | 255 | No | Team URL or logo | Typical F1 data |
| `sys_created_on` | datetime | - | Yes | Record creation timestamp | ServiceNow |

**Indexes**:
- `team_id` (unique)
- `name`

---

### 1.2 Relationship Tables

#### `driver_season` [f1now2.driver_season]
**Purpose**: Junction table linking drivers to seasons they participated in

| Field Name | Type | Max Length | Mandatory | Description | API Source |
|------------|------|------------|-----------|-------------|------------|
| `driver` | reference | - | Yes | Reference to driver | `/api/{year}/drivers` |
| `season` | reference | - | Yes | Reference to season | `/api/{year}/drivers` |
| `driver_number` | integer | - | No | Driver number for this season | `/api/{year}/drivers/{driverId}` |
| `position` | integer | - | No | Championship position this season | `/api/{year}/drivers-championship` |
| `points` | integer | - | No | Total points this season | `/api/{year}/drivers-championship` |
| `wins` | integer | - | No | Number of wins this season | `/api/{year}/drivers-championship` |
| `podiums` | integer | - | No | Number of podium finishes | Calculated/derived |
| `sys_created_on` | datetime | - | Yes | Record creation timestamp | ServiceNow |

**Indexes**:
- `driver` + `season` (unique composite)
- `season`
- `driver`

**Table Properties**:
- Display name: Driver Season Participation

---

#### `driver_team` [f1now2.driver_team]
**Purpose**: Junction table linking drivers to teams for specific seasons

| Field Name | Type | Max Length | Mandatory | Description | API Source |
|------------|------|------------|-----------|-------------|------------|
| `driver` | reference | - | Yes | Reference to driver | `/api/{year}/teams/{teamId}/drivers` |
| `team` | reference | - | Yes | Reference to team | `/api/{year}/teams/{teamId}/drivers` |
| `season` | reference | - | Yes | Reference to season | `/api/{year}/teams/{teamId}/drivers` |
| `is_primary` | boolean | - | No | Primary driver for team | Typical F1 data |
| `sys_created_on` | datetime | - | Yes | Record creation timestamp | ServiceNow |

**Indexes**:
- `driver` + `team` + `season` (unique composite)
- `team` + `season`
- `driver` + `season`

**Table Properties**:
- Display name: Driver Team Affiliation

---

#### `driver_championship` [f1now2.driver_championship]
**Purpose**: Driver championship standings per season

| Field Name | Type | Max Length | Mandatory | Description | API Source |
|------------|------|------------|-----------|-------------|------------|
| `driver` | reference | - | Yes | Reference to driver | `/api/{year}/drivers-championship` |
| `season` | reference | - | Yes | Reference to season | `/api/{year}/drivers-championship` |
| `position` | integer | - | Yes | Championship position (1 = champion) | API |
| `points` | decimal | - | No | Total championship points | API |
| `wins` | integer | - | No | Number of race wins | API |
| `podiums` | integer | - | No | Number of podiums | API |
| `poles` | integer | - | No | Number of pole positions | API |
| `fastest_laps` | integer | - | No | Number of fastest laps | API |
| `dns` | integer | - | No | Did not start count | API |
| `dnf` | integer | - | No | Did not finish count | API |
| `sys_created_on` | datetime | - | Yes | Record creation timestamp | ServiceNow |

**Indexes**:
- `driver` + `season` (unique composite)
- `season` + `position`
- `season`

---

#### `driver_race_result` [f1now2.driver_race_result]
**Purpose**: Individual race results for each driver

| Field Name | Type | Max Length | Mandatory | Description | API Source |
|------------|------|------------|-----------|-------------|------------|
| `driver` | reference | - | Yes | Reference to driver | `/api/{year}/{round}/race` |
| `race` | reference | - | Yes | Reference to race (separate table) | `/api/{year}/{round}/race` |
| `season` | reference | - | Yes | Reference to season | `/api/{year}/{round}/race` |
| `position` | integer | - | No | Race finish position | API |
| `grid_position` | integer | - | No | Starting grid position | API |
| `points` | decimal | - | No | Points scored in race | API |
| `status` | string | 40 | No | Race status (Finished, DNF, DSQ, etc.) | API |
| `time` | string | 40 | No | Race time (e.g., "1:30:45.123") | API |
| `gap` | string | 20 | No | Time gap to winner | API |
| `laps` | integer | - | No | Number of laps completed | API |
| `fastest_lap_time` | string | 20 | No | Fastest lap time | API |
| `fastest_lap_speed` | decimal | - | No | Fastest lap speed (km/h) | API |
| `qualy_position` | integer | - | No | Qualifying position | `/api/{year}/{round}/qualy` |
| `sprint_position` | integer | - | No | Sprint race position (if applicable) | `/api/{year}/{round}/sprint/race` |
| `sys_created_on` | datetime | - | Yes | Record creation timestamp | ServiceNow |

**Indexes**:
- `driver` + `race` (unique composite)
- `race`
- `driver` + `season`
- `season`

---

## 2. Additional Supporting Tables

### `race` [f1now2.race]
**Purpose**: Race information (needed for race results reference)

| Field Name | Type | Max Length | Mandatory | Description |
|------------|------|------------|-----------|-------------|
| `race_id` | string | 40 | Yes | External API identifier |
| `season` | reference | - | Yes | Reference to season |
| `round` | integer | - | Yes | Round number within season |
| `name` | string | 120 | Yes | Race name |
| `circuit` | reference | - | Yes | Reference to circuit |
| `date` | date | - | Yes | Race date |
| `time` | time | - | No | Race start time |
| `url` | string | 255 | No | Official race URL |

---

### `circuit` [f1now2.circuit]
**Purpose**: Race circuit information

| Field Name | Type | Max Length | Mandatory | Description | API Source |
|------------|------|------------|-----------|-------------|------------|
| `circuit_id` | string | 40 | Yes | External API identifier | `/api/circuits` |
| `name` | string | 100 | Yes | Circuit name | API |
| `location` | string | 100 | No | Circuit location | API |
| `country` | string | 40 | No | Country | API |
| `lat` | decimal | - | No | Latitude | API |
| `lng` | decimal | - | No | Longitude | API |
| `alt` | integer | - | No | Altitude (meters) | API |
| `length` | decimal | - | No | Circuit length (km) | API |
| `laps` | integer | - | No | Typical race laps | API |
| `first_grand_prix` | integer | - | No | First GP year | API |

---

## 3. Integration Architecture

### 3.1 REST Messages Overview

**REST Messages** (`sys_rest_message`) are ServiceNow's native outbound HTTP integration framework. They provide:

- **Reusable API definitions**: One base URL with shared authentication and headers
- **Multiple operations**: Each message can have multiple functions (GET, POST, PUT, DELETE) for different endpoints
- **Parameterized requests**: URL, headers, and body templates with `${variable}` substitution
- **Authentication support**: Basic Auth, OAuth 2.0, API Keys, or no authentication
- **MID Server support**: Route through MID servers for on-premise/internal targets
- **Runtime invocation**: Called via `sn_ws.RESTMessageV2` from server-side scripts

### 3.2 REST Message Design for F1 API

We will create the following REST Messages:

#### REST Message: `F1API - Base`
- **Endpoint**: `https://f1api.dev`
- **Authentication**: `noAuthentication` (f1api.dev does not require authentication based on OpenAPI spec)
- **Description**: Base REST Message for all F1 API endpoints
- **Access**: `public` (allow cross-scope access from IntegrationHub)

**Functions**:

| Function Name | HTTP Method | Endpoint | Description | Parameters |
|---------------|-------------|----------|-------------|------------|
| `getSeasons` | GET | `/api/seasons` | Get all F1 seasons | limit, offset |
| `getSeason` | GET | `/api/{year}` | Get races for a specific season | year, limit, offset, timezone |
| `getCircuits` | GET | `/api/circuits` | Get all circuits | limit, offset |
| `getCircuit` | GET | `/api/circuits/{circuitId}` | Get specific circuit | circuitId |
| `getTeams` | GET | `/api/teams` | Get all teams | limit, offset |
| `getTeam` | GET | `/api/teams/{teamId}` | Get specific team | teamId |
| `getDrivers` | GET | `/api/drivers` | Get all drivers | limit, offset |
| `getDriver` | GET | `/api/drivers/{driverId}` | Get specific driver | driverId |
| `getDriverSeason` | GET | `/api/{year}/drivers/{driverId}` | Get driver results for season | year, driverId, limit, offset |
| `getDriversBySeason` | GET | `/api/{year}/drivers` | Get drivers for a season | year, limit, offset |
| `getTeamsBySeason` | GET | `/api/{year}/teams` | Get teams for a season | year, limit, offset |
| `getDriverChampionship` | GET | `/api/{year}/drivers-championship` | Get championship standings | year, limit, offset |
| `getRace` | GET | `/api/{year}/{round}/race` | Get race results | year, round, limit, offset, timezone |
| `getQualifying` | GET | `/api/{year}/{round}/qualy` | Get qualifying results | year, round, limit, offset, timezone |
| `getCurrentSeason` | GET | `/api/current` | Get current season races | limit, offset, timezone |
| `getCurrentDrivers` | GET | `/api/current/drivers` | Get current season drivers | limit, offset |
| `getCurrentDriverChampionship` | GET | `/api/current/drivers-championship` | Get current championship | limit, offset |

### 3.3 IntegrationHub Custom Actions

**IntegrationHub Custom Actions** provide a reusable, orchestrated layer on top of REST Messages. They:

- **Encapsulate business logic**: Combine multiple REST calls and data transformations
- **Standardize error handling**: Consistent error handling across all integrations
- **Enable reuse**: Called from Flows, Subflows, or other Custom Actions
- **Support testing**: Can be tested independently via Flow Designer
- **Provide typed I/O**: Strongly typed inputs and outputs

#### Custom Action Design

We will create the following Custom Actions in `fluent/actions/`:

##### `fetchAllSeasons.now.ts`
- **Purpose**: Fetch all F1 seasons from the API
- **REST Message**: `F1API - Base` (function: `getSeasons`)
- **Inputs**: None (uses default pagination)
- **Outputs**: Array of season objects
- **Logic**: 
  - Call `getSeasons` with limit=100
  - Handle pagination if needed
  - Transform response to ServiceNow format

##### `fetchSeasonData.now.ts`
- **Purpose**: Fetch complete data for a specific season
- **Inputs**: `year` (integer)
- **Outputs**: Season object with teams, drivers, races
- **Logic**:
  - Call `getSeason` for race list
  - Call `getTeamsBySeason` for teams
  - Call `getDriversBySeason` for drivers
  - Call `getDriverChampionship` for standings
  - Aggregate and return structured data

##### `fetchDriverDetails.now.ts`
- **Purpose**: Fetch detailed information for a specific driver
- **Inputs**: `driverId` (string)
- **Outputs**: Driver object with career stats
- **Logic**:
  - Call `getDriver` for basic info
  - Fetch all seasons the driver participated in
  - Aggregate championship data across seasons

##### `fetchRaceResults.now.ts`
- **Purpose**: Fetch race results for a specific race
- **Inputs**: `year` (integer), `round` (integer)
- **Outputs**: Race object with all driver results
- **Logic**:
  - Call `getRace` for race data
  - Call `getQualifying` for qualifying data
  - Combine into single response

##### `syncDriverData.now.ts`
- **Purpose**: Full synchronization action for driver data
- **Inputs**: `seasonYear` (optional, defaults to current)
- **Outputs**: Sync summary (records created, updated, errors)
- **Logic**:
  - Orchestrate calls to other custom actions
  - Handle record matching and upsert logic
  - Write to f1now2.driver, f1now2.driver_season, etc.
  - Return sync statistics

##### `syncChampionshipData.now.ts`
- **Purpose**: Synchronize championship standings
- **Inputs**: `year` (integer)
- **Outputs**: Championship data sync summary
- **Logic**:
  - Call `getDriverChampionship`
  - Match drivers to existing records
  - Update f1now2.driver_championship

##### `syncRaceResults.now.ts`
- **Purpose**: Synchronize race results
- **Inputs**: `year` (integer), `round` (integer)
- **Outputs**: Race results sync summary
- **Logic**:
  - Call `getRace`
  - Process each result in the response
  - Update f1now2.driver_race_result

### 3.4 REST Message Implementation (Fluent SDK)

**File Location**: `src/integration/rest-messages/f1api.now.ts`

```typescript
import { RestMessage } from '@servicenow/sdk/integration';

export const F1API = RestMessage({
  $id: Now.ID['f1api-rest-message'],
  name: 'F1API - Base',
  endpoint: 'https://f1api.dev',
  description: 'REST Message for F1 API (f1api.dev) - No authentication required',
  authenticationType: 'noAuthentication',
  access: 'public',
  headers: [
    {
      $id: Now.ID['f1api-header-content-type'],
      name: 'Content-Type',
      value: 'application/json',
    },
    {
      $id: Now.ID['f1api-header-accept'],
      name: 'Accept',
      value: 'application/json',
    },
  ],
  functions: [
    // Seasons
    {
      $id: Now.ID['f1api-fn-get-seasons'],
      name: 'getSeasons',
      httpMethod: 'GET',
      endpoint: '/api/seasons',
      variables: [
        { $id: Now.ID['f1api-var-limit'], name: 'limit' },
        { $id: Now.ID['f1api-var-offset'], name: 'offset' },
      ],
      queryParams: [
        { $id: Now.ID['f1api-qp-limit'], name: 'limit', value: '${limit}', order: 1 },
        { $id: Now.ID['f1api-qp-offset'], name: 'offset', value: '${offset}', order: 2 },
      ],
    },
    // Drivers
    {
      $id: Now.ID['f1api-fn-get-drivers'],
      name: 'getDrivers',
      httpMethod: 'GET',
      endpoint: '/api/drivers',
      variables: [
        { $id: Now.ID['f1api-var-limit-drivers'], name: 'limit' },
        { $id: Now.ID['f1api-var-offset-drivers'], name: 'offset' },
      ],
      queryParams: [
        { $id: Now.ID['f1api-qp-limit-drivers'], name: 'limit', value: '${limit}', order: 1 },
        { $id: Now.ID['f1api-qp-offset-drivers'], name: 'offset', value: '${offset}', order: 2 },
      ],
    },
    // Add all other functions...
  ],
});
```

### 3.5 Custom Action Implementation (Fluent SDK)

**File Location**: `fluent/actions/fetch-seasons.now.ts`

```typescript
import { Action, wfa, actionStep } from '@servicenow/sdk/automation';
import { StringColumn, IntegerColumn, ArrayColumn } from '@servicenow/sdk/core';

export const fetchAllSeasons = Action(
  {
    $id: Now.ID['fetch-all-seasons-action'],
    name: 'Fetch All Seasons',
    description: 'Fetches all F1 seasons from the API',
    access: 'public',
    inputs: {
      limit: IntegerColumn({ label: 'Limit', mandatory: false, default: 100 }),
      offset: IntegerColumn({ label: 'Offset', mandatory: false, default: 0 }),
    },
    outputs: {
      seasons: ArrayColumn({ label: 'Seasons', type: 'object' }),
      count: IntegerColumn({ label: 'Total Count' }),
      success: StringColumn({ label: 'Success Status' }),
      errorMessage: StringColumn({ label: 'Error Message' }),
    },
  },
  (params) => {
    // Call REST Message to fetch seasons
    const restCall = wfa.actionStep(
      actionStep.restMessage,
      { $id: Now.ID['rest-call-seasons'], label: 'Call F1API getSeasons' },
      {
        rest_message: 'F1API - Base',
        rest_message_function: 'getSeasons',
        rest_message_parameters: {
          limit: wfa.dataPill(params.inputs.limit, 'string'),
          offset: wfa.dataPill(params.inputs.offset, 'string'),
        },
      }
    );

    // Parse and transform response
    const transform = wfa.actionStep(
      actionStep.transformRecord,
      { $id: Now.ID['transform-seasons'], label: 'Transform to ServiceNow format' },
      {
        transform_map: 'f1now2.season',
        source: wfa.dataPill(restCall.response_body, 'string'),
      }
    );

    // Assign outputs
    wfa.assignActionOutputs(params.outputs, {
      seasons: wfa.dataPill(transform.transformed_record, 'string'),
      count: '1',
      success: 'true',
      errorMessage: '',
    });
  }
);
```

---

## 4. Data Ingestion Strategy

### 4.1 Ingestion Order
1. **Foundational Tables First**
   - `season` (populate all seasons from `/api/seasons`)
   - `circuit` (populate all circuits from `/api/circuits`)
   - `team` (populate all teams from `/api/teams`)

2. **Driver Master Data**
   - `driver` (populate from `/api/drivers`)
   - Enrich with details from `/api/drivers/{driverId}`

3. **Seasonal Relationships**
   - `driver_season` (from `/api/{year}/drivers`)
   - `driver_team` (from `/api/{year}/teams/{teamId}/drivers`)

4. **Performance Data**
   - `driver_championship` (from `/api/{year}/drivers-championship`)
   - `race` (from `/api/{year}`)
   - `driver_race_result` (from `/api/{year}/{round}/race`, `/api/{year}/{round}/qualy`)

### 4.2 Integration Approach - REST Messages + Custom Actions

**Primary Approach**: IntegrationHub Custom Actions orchestrating REST Message calls

**Architecture Layers**:
1. **REST Messages** (Lowest level): Direct HTTP calls to f1api.dev
2. **Custom Actions** (Middle layer): Orchestrate REST calls, handle errors, transform data
3. **Flows** (Highest level): Business process orchestration using Custom Actions

**Benefits of this approach**:
- **Separation of concerns**: REST Messages handle transport, Custom Actions handle business logic
- **Reusability**: REST Messages can be reused across multiple Custom Actions
- **Testability**: Custom Actions can be tested independently
- **Maintainability**: Changes to API endpoints only affect REST Messages
- **Governance**: Follows ServiceNow best practices for outbound integrations

### 4.3 API Call Sequence for Initial Load

```
Flow: Initial Data Load
  │
  ├─▶ Custom Action: syncAllSeasons
  │     └─▶ REST: getSeasons (limit=100)
  │
  ├─▶ Custom Action: syncAllCircuits  
  │     └─▶ REST: getCircuits (limit=100)
  │
  ├─▶ Custom Action: syncAllTeams
  │     └─▶ REST: getTeams (limit=100)
  │
  ├─▶ Custom Action: syncAllDrivers
  │     └─▶ REST: getDrivers (limit=100)
  │
  └─▶ For each season (year):
        ├─▶ Custom Action: syncSeasonData(year)
        │     ├─▶ REST: getSeason(year)
        │     ├─▶ REST: getTeamsBySeason(year)
        │     ├─▶ REST: getDriversBySeason(year)
        │     └─▶ REST: getDriverChampionship(year)
        │
        └─▶ For each race (round) in season:
              ├─▶ Custom Action: syncRaceData(year, round)
              │     ├─▶ REST: getRace(year, round)
              │     └─▶ REST: getQualifying(year, round)
              │
              └─▶ Custom Action: syncRaceResults(year, round)
                    └─▶ Process and store in driver_race_result
```

### 4.4 Incremental Update Strategy

**Trigger**: Scheduled Flow runs daily at 02:00 UTC

**Flow Structure**:
```
Flow: Daily Incremental Sync
  │
  ├─▶ Custom Action: getCurrentSeason
  │     └─▶ REST: getCurrentSeason
  │
  ├─▶ Custom Action: syncCurrentDrivers
  │     └─▶ REST: getCurrentDrivers
  │
  ├─▶ Custom Action: syncCurrentTeams
  │     └─▶ REST: getCurrentTeams
  │
  ├─▶ Custom Action: syncCurrentChampionship
  │     └─▶ REST: getCurrentDriverChampionship
  │
  └─▶ Custom Action: syncLatestRaceResults
        └─▶ REST: getRace (latest round)
```

**Logic**:
1. Check current season from `/api/current`
2. For current season:
   - Update `driver` with any new drivers
   - Update `driver_team` with team changes
   - Update `driver_championship` with latest standings
   - Update `driver_race_result` with latest race results
3. For previous season (if recent):
   - Finalize championship data
   - Ensure all race results are captured

**Delta Detection**:
- Compare `sys_updated_on` with last API fetch timestamp
- Use API `limit` and `offset` parameters for pagination
- Track sync status in a control table

---

## 5. ServiceNow Implementation Components

### 5.1 Tables Summary

| Table | Scoped Name | Type | Parent Table | Purpose |
|-------|-------------|------|--------------|---------|
| driver | f1now2.driver | Custom | cmdb_ci | Master driver records |
| season | f1now2.season | Custom | cmdb_ci | Master season records |
| team | f1now2.team | Custom | cmdb_ci | Master team records |
| circuit | f1now2.circuit | Custom | cmdb_ci | Circuit information |
| race | f1now2.race | Custom | cmdb_ci | Race events |
| driver_season | f1now2.driver_season | Custom | - | Driver-season relationship |
| driver_team | f1now2.driver_team | Custom | - | Driver-team-season relationship |
| driver_championship | f1now2.driver_championship | Custom | - | Championship standings |
| driver_race_result | f1now2.driver_race_result | Custom | - | Individual race results |

### 5.2 Forms and UI

**driver Form** (f1now2.driver):
- Header: driver_id, name, active, nationality, permanent_number
- Related Lists:
  - Driver Seasons (f1now2.driver_season)
  - Teams (f1now2.driver_team)
  - Championship History (f1now2.driver_championship)
  - Race Results (f1now2.driver_race_result)

**driver List View** (f1now2.driver):
- Columns: driver_id, name, nationality, permanent_number, active, last_season
- Default sort: name
- Filters: active, nationality, season

### 5.3 Access Control

**Roles**:
- `f1now2_admin`: Full access to all F1Now2 tables
- `f1now2_viewer`: Read-only access
- `f1now2_editor`: Can update driver biographical info

**ACLs**:
- f1now2.driver: Public read, f1now2_admin/f1now2_editor write
- f1now2.driver_*: f1now2_admin write, f1now2_viewer read
- Integration user: Special role for API sync operations

### 5.4 Integration User

Create dedicated integration user:
- Username: `f1now2.api.integration`
- Role: `f1now2_integration` (custom role with write access to all F1Now2 tables)
- Password: Store in ServiceNow credentials store
- No interactive login allowed

---

## 6. Data Transformation Rules

### 6.1 Field Mapping from API to ServiceNow

**Driver (/api/drivers/{driverId}) → driver (f1now2.driver)**:
```
API Field → ServiceNow Field
id → driver_id
name → name
firstName → first_name
lastName → last_name
shortName → short_name
dateOfBirth → date_of_birth
nationality → nationality
permanentNumber → permanent_number
bio → bio
url → url
```

**Driver Championship (/api/{year}/drivers-championship) → driver_championship (f1now2.driver_championship)**:
```
API Fields → ServiceNow Fields
position → position
points → points
wins → wins
Driver.driverId → driver.driver_id (lookup)
year → season.year (lookup)
```

**Race Results (/api/{year}/{round}/race) → driver_race_result (f1now2.driver_race_result)**:
```
API Fields → ServiceNow Fields
Results[].Driver.driverId → driver.driver_id
Results[].position → position
Results[].points → points
Results[].status → status
Results[].Time.time → time
Results[].FastestLap.time → fastest_lap_time
Results[].FastestLap.speed → fastest_lap_speed
race.year → season.year
race.round → race.round
```

### 6.2 Data Type Conversions

| API Type | ServiceNow Type | Conversion Notes |
|----------|-----------------|------------------|
| integer | integer | Direct mapping |
| string | string | Direct mapping, truncate to max length |
| date | date | Parse ISO 8601 format |
| time | time | Parse HH:mm:ss format |
| null | - | Leave field empty |
| boolean | boolean | Direct mapping |

### 6.3 Error Handling

**API Response Errors**:
- 404 Not Found: Log warning, skip record
- 500 Server Error: Retry 3 times, then log error
- Rate limiting: Implement exponential backoff
- Invalid data: Log error, skip problematic field

**Data Validation**:
- Required fields must be present
- Numeric fields must be valid numbers
- Date fields must be valid dates
- Reference fields must match existing records

---

## 7. Reporting and Dashboards

### 7.1 Key Reports

1. **Active Drivers**
   - Filter: f1now2.driver.active = true
   - Columns: driver_id, name, nationality, permanent_number, current_team

2. **Championship Leaders (Current Season)**
   - Filter: f1now2.driver_championship.season = current_year
   - Sort: position ascending
   - Columns: driver.name, position, points, wins

3. **Driver Career Stats**
   - Group by: driver
   - Aggregations: COUNT(races), SUM(points), AVG(position)

4. **Team Driver Lineup**
   - Filter by season
   - Show: team.name, driver1.name, driver2.name

### 7.2 Dashboards

**F1 Overview Dashboard**:
- Current championship standings (top 10)
- Active drivers by nationality
- Recent race results
- Upcoming races

**Driver Detail Dashboard**:
- Career statistics
- Season-by-season performance
- Race results timeline
- Comparison with teammates

---

## 8. Automation and Workflows

### 8.1 Data Sync Workflow

```
Trigger: Scheduled Flow (Daily at 02:00 UTC)

Steps:
1. Custom Action: getCurrentSeasonInfo
   └─▶ Returns current season year and latest race

2. Custom Action: syncDrivers
   └─▶ REST calls to update driver table

3. Custom Action: syncTeams
   └─▶ REST calls to update team table

4. Custom Action: syncCurrentSeasonData
   └─▶ Orchestrates all current season sync operations

5. Custom Action: updateSyncLog
   └─▶ Records sync results and timestamp

6. Decision: Any errors?
   ├─▶ Yes → Notification: Send error alert
   └─▶ No → Complete
```

### 8.2 Record Matching Logic

**Driver Matching** (for updates):
- Primary: driver_id (exact match)
- Fallback: name + date_of_birth (if driver_id missing)

**Team Matching**:
- Primary: team_id (exact match)
- Fallback: name (exact match)

**Season Matching**:
- Primary: year (exact match)

### 8.3 Notification Rules

- **Sync Failure**: Email to admin group
- **New Driver**: Slack notification to #f1-updates
- **Championship Change**: Update dashboard widgets

---

## 9. Testing Strategy

### 9.1 Unit Tests

1. **REST Message Testing**: Verify each REST Message function returns valid data
   - Test with known valid parameters
   - Test error handling (invalid endpoints, timeouts)
   - Verify authentication configuration

2. **Custom Action Testing**: Test each Custom Action independently
   - Test with mock REST Message responses
   - Test error paths and validation
   - Verify output structure

3. **Data Transformation**: Verify field mappings work correctly
4. **Error Handling**: Test with invalid/missing data

### 9.2 Integration Tests

1. **Full Sync**: Test complete data load
2. **Incremental Sync**: Test with only new/changed data
3. **Conflict Resolution**: Test update scenarios
4. **Performance**: Test with maximum data volume (100+ drivers, 70+ years)

### 9.3 Acceptance Criteria

- [ ] All tables created with correct schema
- [ ] REST Messages configured and tested
- [ ] Custom Actions implemented and tested
- [ ] API integration successfully fetches data
- [ ] All driver data from API is stored correctly
- [ ] Relationships between entities are properly maintained
- [ ] Reports and dashboards display correct data
- [ ] Sync process completes within 5 minutes
- [ ] Error handling works for all failure scenarios

---

## 10. Maintenance and Support

### 10.1 Monitoring

- **Sync Logs**: Track each sync operation with status, duration, records processed
- **Data Quality**: Regular checks for orphaned records, missing data
- **Performance**: Monitor sync duration, API response times
- **REST Message Metrics**: Track call volume, success rates, latency

### 10.2 Backup Strategy

- All F1 data tables included in standard ServiceNow backup
- Export capability: CSV export of all tables weekly
- Restore testing: Quarterly restore tests

### 10.3 Documentation

- **Technical**: This plan document, API mappings, REST Message configurations, Custom Action definitions
- **User**: How to view driver data, run reports, interpret dashboards
- **Admin**: How to troubleshoot sync issues, manual data updates, REST Message testing

---

## 11. Dependencies and Assumptions

### Dependencies
1. ServiceNow instance with:
   - Custom table creation rights
   - IntegrationHub license (for Custom Actions and Flows)
   - REST Message capabilities
   - Scheduled Flow capabilities
2. f1api.dev API accessibility from ServiceNow instance (no firewall blocking)
3. Sufficient API rate limits from f1api.dev (check their terms)

### Assumptions
1. f1api.dev allows automated access (no API key required based on OpenAPI spec)
2. API response structure is consistent with OpenAPI spec
3. Historical data is available for all seasons back to 1950
4. ServiceNow instance has sufficient storage for ~1000 drivers, ~800 races, ~25000 race results

---

## 12. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| API rate limiting | Medium | High | Implement rate limiting in Custom Actions, exponential backoff, respect API limits |
| API schema changes | Low | High | Version API responses, validate before processing, use flexible data mapping |
| Data volume too large | Low | Medium | Implement pagination, batch processing, incremental sync |
| Integration user locked | Low | Medium | Monitor account, set password to never expire, use credential aliases |
| Sync failures | Medium | Medium | Comprehensive error handling in Custom Actions, retry logic, detailed logging |
| Data inconsistencies | Medium | Medium | Validation rules in Custom Actions, data quality checks, reconciliation jobs |
| REST Message configuration drift | Low | Medium | Version control REST Message definitions in Fluent SDK, CI/CD deployment |

---

## 13. File Structure (Fluent SDK)

```
src/
├── integration/
│   └── rest-messages/
│       └── f1api.now.ts          # REST Message definitions
│
fluent/
├── actions/
│   ├── fetch-seasons.now.ts
│   ├── fetch-circuits.now.ts
│   ├── fetch-teams.now.ts
│   ├── fetch-drivers.now.ts
│   ├── fetch-season-data.now.ts
│   ├── fetch-driver-details.now.ts
│   ├── fetch-race-results.now.ts
│   ├── sync-driver-data.now.ts
│   ├── sync-championship-data.now.ts
│   ├── sync-race-results.now.ts
│   └── sync-all-data.now.ts
│
└── flows/
    ├── daily-sync.now.ts
    ├── initial-load.now.ts
    └── error-handling.now.ts
```

---

## Appendix A: API Endpoints Reference

**Driver-Specific Endpoints**:
- `GET /api/drivers` - All drivers
- `GET /api/drivers/{driverId}` - Specific driver
- `GET /api/drivers/search?q={query}` - Search drivers
- `GET /api/{year}/drivers` - Drivers in a season
- `GET /api/{year}/drivers/{driverId}` - Driver results for season
- `GET /api/{year}/teams/{teamId}/drivers` - Team drivers for season
- `GET /api/current/drivers` - Current season drivers
- `GET /api/current/drivers/{driverId}` - Current season driver results
- `GET /api/current/teams/{teamId}/drivers` - Current team drivers
- `GET /api/{year}/drivers-championship` - Championship standings
- `GET /api/current/drivers-championship` - Current championship standings
- `GET /api/{year}/compare/{driverId1}/{driverId2}` - Head-to-head comparison

**Common Parameters**:
- `limit`: 1-100 (default: 30)
- `offset`: 0-10000 (default: 0)
- `timezone`: IANA timezone identifier

---

## Appendix B: Data Volume Estimates

| Entity | Table | Estimated Count | Storage (approx.) |
|--------|-------|-----------------|-------------------|
| Seasons | f1now2.season | 80 (1950-2025+) | Negligible |
| Circuits | f1now2.circuit | ~80 | Negligible |
| Teams | f1now2.team | ~200 | Negligible |
| Drivers | f1now2.driver | ~1000 | ~100 MB |
| Driver-Season | f1now2.driver_season | ~5000 | ~200 MB |
| Driver-Team | f1now2.driver_team | ~5000 | ~200 MB |
| Races | f1now2.race | ~1100 (20 races/year * 80 years * 0.7) | ~50 MB |
| Race Results | f1now2.driver_race_result | ~20000 (20 drivers * 1100 races) | ~500 MB |
| Championship | f1now2.driver_championship | ~8000 (1000 drivers * 8 seasons avg) | ~200 MB |
| **Total** | | ~40,880 records | ~1.2 GB |

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Approve** the table structure, REST Message design, and Custom Action definitions
3. **Assign** development resources
4. **Set up** ServiceNow development environment with IntegrationHub
5. **Implement** REST Messages using Fluent SDK
6. **Develop** Custom Actions in IntegrationHub
7. **Test** each component independently
8. **Deploy** to production instance
9. **Schedule** kickoff meeting

---

*Plan created based on F1 API OpenAPI specification (f1api.dev)*
*Last updated: 2026-07-15*
*Integration approach updated: Using REST Messages + IntegrationHub Custom Actions*
*Table naming convention: All tables use f1now2 scope prefix without f1_ prefix*