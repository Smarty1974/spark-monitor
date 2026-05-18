import {
  List, Datagrid, TextField, DateField,
  Show, SimpleShowLayout,
  Create, Edit, SimpleForm, TextInput, DateTimeInput,
  SearchInput, TopToolbar, CreateButton, FilterButton, ExportButton,
  Toolbar, SaveButton, DeleteButton,
  required, maxLength,
} from 'react-admin'

const STATUS_COLORS: Record<string, string> = {
  PENDING:   '#f57c00',
  RUNNING:   '#1565c0',
  SUCCEEDED: '#2e7d32',
  FAILED:    '#c62828',
  CANCELLED: '#757575',
}

const StatusField = ({ record }: { record?: any }) => {
  const status = record?.status || ''
  const color = STATUS_COLORS[status] || '#333'
  return (
    <span style={{
      padding: '3px 10px',
      borderRadius: 12,
      backgroundColor: color + '22',
      color,
      fontWeight: 600,
      fontSize: 12,
    }}>
      {status}
    </span>
  )
}

const sparkJobFilters = [
  <SearchInput source="q" alwaysOn placeholder="Cerca per nome..." />,
]

const ListActions = () => (
  <TopToolbar>
    <FilterButton />
    <CreateButton />
    <ExportButton />
  </TopToolbar>
)

export const SparkJobList = () => (
  <List
    filters={sparkJobFilters}
    actions={<ListActions />}
    sort={{ field: 'id', order: 'DESC' }}
    perPage={25}
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" label="ID" />
      <TextField source="jobName" label="Nome Job" />
      <TextField source="applicationId" label="App ID" />
      <TextField source="status" label="Stato" />
      <TextField source="masterUrl" label="Master URL" />
      <TextField source="mainClass" label="Main Class" />
      <DateField source="startedAt" label="Avviato" showTime />
      <DateField source="finishedAt" label="Completato" showTime />
      <TextField source="durationMs" label="Durata (ms)" />
      <DateField source="createdAt" label="Creato" showTime />
    </Datagrid>
  </List>
)

export const SparkJobShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" label="ID" />
      <TextField source="jobName" label="Nome Job" />
      <TextField source="applicationId" label="Application ID" />
      <TextField source="status" label="Stato" />
      <TextField source="masterUrl" label="Master URL" />
      <TextField source="jarPath" label="JAR Path" />
      <TextField source="mainClass" label="Main Class" />
      <TextField source="sparkConfig" label="Spark Config" />
      <DateField source="startedAt" label="Avviato il" showTime />
      <DateField source="finishedAt" label="Completato il" showTime />
      <TextField source="durationMs" label="Durata (ms)" />
      <TextField source="errorMessage" label="Messaggio Errore" />
      <DateField source="createdAt" label="Creato il" showTime />
      <DateField source="updatedAt" label="Aggiornato il" showTime />
    </SimpleShowLayout>
  </Show>
)

const SparkJobForm = () => (
  <>
    <TextInput source="jobName"       label="Nome Job"      validate={[required(), maxLength(255)]} fullWidth />
    <TextInput source="applicationId" label="Application ID" validate={[maxLength(100)]} fullWidth />
    <TextInput source="status"        label="Stato"          validate={[required()]} defaultValue="PENDING" fullWidth />
    <TextInput source="masterUrl"     label="Master URL"     validate={[required(), maxLength(500)]} fullWidth />
    <TextInput source="jarPath"       label="JAR Path"       validate={[required(), maxLength(1000)]} fullWidth />
    <TextInput source="mainClass"     label="Main Class"     validate={[required(), maxLength(500)]} fullWidth />
    <TextInput source="sparkConfig"   label="Spark Config"   validate={[maxLength(5000)]} fullWidth multiline rows={4} />
    <DateTimeInput source="startedAt"  label="Avviato il" />
    <DateTimeInput source="finishedAt" label="Completato il" />
    <TextInput source="errorMessage"  label="Messaggio Errore" validate={[maxLength(5000)]} fullWidth multiline rows={3} />
  </>
)

export const SparkJobCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <SparkJobForm />
    </SimpleForm>
  </Create>
)

const EditToolbar = () => (
  <Toolbar sx={{ justifyContent: 'space-between' }}>
    <SaveButton />
    <DeleteButton />
  </Toolbar>
)

export const SparkJobEdit = () => (
  <Edit>
    <SimpleForm toolbar={<EditToolbar />}>
      <SparkJobForm />
    </SimpleForm>
  </Edit>
)
