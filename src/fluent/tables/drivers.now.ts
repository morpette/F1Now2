import { Table, StringColumn } from '@servicenow/sdk/core'

// Variable name MUST match the name property
export const x_466181_f1now2_drivers = Table({
  name: 'x_466181_f1now2_drivers',
  label: 'F1 Drivers',
  display: 'name',
  schema: {
    name: StringColumn({
      label: 'Name',
      mandatory: true,
      maxLength: 100,
    }),
  },
})
