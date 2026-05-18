import { Admin, Resource } from 'react-admin'
import dataProvider from './dataProvider'
import authProvider from './authProvider'
import { theme } from './theme'
import { Dashboard } from './Dashboard'

import { SparkJobList, SparkJobShow, SparkJobCreate, SparkJobEdit } from './resources/SparkJob'
import { SparkJobExecutionList, SparkJobExecutionShow, SparkJobExecutionCreate, SparkJobExecutionEdit } from './resources/SparkJobExecution'
import { SparkMetricList, SparkMetricShow, SparkMetricCreate, SparkMetricEdit } from './resources/SparkMetric'
import { SparkScheduleList, SparkScheduleShow, SparkScheduleCreate, SparkScheduleEdit } from './resources/SparkSchedule'
import { SparkAlertList, SparkAlertShow, SparkAlertCreate, SparkAlertEdit } from './resources/SparkAlert'

export default function App() {
  return (
    <Admin
      dataProvider={dataProvider}
      authProvider={authProvider}
      theme={theme}
      title="Spark Monitor"
      dashboard={Dashboard}
      requireAuth
    >
      <Resource
        name="spark-jobs"
        list={SparkJobList}
        show={SparkJobShow}
        create={SparkJobCreate}
        edit={SparkJobEdit}
        options={{ label: 'Spark Jobs' }}
      />
      <Resource
        name="spark-job-executions"
        list={SparkJobExecutionList}
        show={SparkJobExecutionShow}
        create={SparkJobExecutionCreate}
        edit={SparkJobExecutionEdit}
        options={{ label: 'Esecuzioni' }}
      />
      <Resource
        name="spark-metrics"
        list={SparkMetricList}
        show={SparkMetricShow}
        create={SparkMetricCreate}
        edit={SparkMetricEdit}
        options={{ label: 'Metriche' }}
      />
      <Resource
        name="spark-schedules"
        list={SparkScheduleList}
        show={SparkScheduleShow}
        create={SparkScheduleCreate}
        edit={SparkScheduleEdit}
        options={{ label: 'Schedulazioni' }}
      />
      <Resource
        name="spark-alerts"
        list={SparkAlertList}
        show={SparkAlertShow}
        create={SparkAlertCreate}
        edit={SparkAlertEdit}
        options={{ label: 'Alert' }}
      />
    </Admin>
  )
}
