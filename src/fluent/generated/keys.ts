import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    bom_json: {
                        table: 'sys_module'
                        id: '9ce72180ff8f492e870fd8759bc2a830'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: '5c013427342341b7bf79b9ff356acbb8'
                    }
                }
                composite: [
                    {
                        table: 'ua_table_licensing_config'
                        id: '0281e3fcce3a4909badc9b14ea35eb0f'
                        key: {
                            name: 'x_466181_f1now2_drivers'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '1f19426382a8400583b2db3c3a1c38e3'
                        key: {
                            name: 'x_466181_f1now2_drivers'
                            element: 'name'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '48130961a4f44162b911d3b9807e7ec4'
                        key: {
                            name: 'x_466181_f1now2_drivers'
                            element: 'NULL'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '5e9d80dba1de42a1b200b75a3e221c28'
                        key: {
                            name: 'x_466181_f1now2_drivers'
                            element: 'name'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '83a7827b2500469e8871676b4590913d'
                        key: {
                            name: 'x_466181_f1now2_drivers'
                            element: 'NULL'
                        }
                    },
                    {
                        table: 'sys_db_object'
                        id: 'b2de3d8d4cf44cff8501db2f02cd24f7'
                        key: {
                            name: 'x_466181_f1now2_drivers'
                        }
                    },
                ]
            }
        }
    }
}
