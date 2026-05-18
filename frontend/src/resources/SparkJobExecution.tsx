import {
  List, Datagrid, TextField, NumberField, DateField,
  ReferenceField,
  Show, SimpleShowLayout,
  Create, Edit, SimpleForm, TextInput, NumberInput, DateTimeInput,
  ReferenceInput, SelectInput,
  TopToolbar, CreateButton, FilterButton, ExportButton,
  Toolbar, SaveButton, DeleteButton,
  required,
} from 'react-admin'

const ListActions = () => (
  <TopToolbar>
    <FilterButton />
    <CreateButton />
    <ExportButton />
  </TopToolbar>
)

export const SparkJobExecutionList = () => (
  <List
    actions={<ListActions />}
    sort={{ field: 'id', order: 'DESC' }}
    perPage={25}
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" label="ID" />
      <ReferenceField source="sparkJobId" reference="spark-jobs" label="Job">
        <TextField source="jobName" />
      </ReferenceField>
      <NumberField source="executionNumber" label="Esecuzione #" />
      <TextField source="status" label="Stato" />
      <DateField source="startedAt" label="Avviato" showTime />
      <DateField source="finishedAt" label="Completato" showTime />
      <NumberField source="durationMs" label="Durata (ms)" />
      <NumberField source="recordsRead" label="Record Letti" />
      <NumberField source="recordsWritten" label="Record Scritti" />
      <TextField source="sparkUiUrl" label="Spark UI" />
      <DateField source="createdAt" label="Creato" showTime />
    </Datagrid>
  </List>
)

export const SparkJobExecutionShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" label="ID" />
      <ReferenceField source="sparkJobId" reference="spark-jobs" label="Job">
        <TextField source="jobName" />
      </ReferenceField>
      <NumberField source="executionNumber" label="Numero Esecuzione" />
      <TextField source="status" label="Stato" />
      <DateField source="startedAt" label="Avviato il" showTime />
      <DateField source="finishedAt" label="Completato il" showTime />
      <NumberField source="durationMs" label="Durata (ms)" />
      <NumberField source="recordsRead" label="Record Letti" />
      <NumberField source="recordsWritten" label="Record Scritti" />
      <TextField source="errorMessage" label="Errore" />
      <TextField source="sparkUiUrl" label="Spark UI URL" />
      <TextField source="logsPath" label="Path Log" />
      <DateField source="createdAt" label="Creato il" showTime />
      <DateField source="updatedAt" label="Aggiornato il" showTime />
    </SimpleShowLayout>
  </Show>
)

const SparkJobExecutionForm = () => (
  <>
    <ReferenceInput source="sparkJobId" reference="spark-jobs" label="Job Spark">
      <SelectInput optionText="jobName" validate={required()} fullWidth />
    </ReferenceInput>
    <NumberInput source="executionNumber" label="Numero Esecuzione" validate={required()} />
    <TextInput source="status" label="Stato" validate={required()} defaultValue="RUNNING" fullWidth />
    <DateTimeInput source="startedAt" label="Avviato il" />
    <DateTimeInput source="finishedAt" label="Completato il" />
    <NumberInput source="durationMs" label="Durata (ms)" />
    <NumberInput source="recordsRead" label="Record Letti" />
    <NumberInput source="recordsWritten" label="Record Scritti" />
    <TextInput source="errorMessage" label="Messaggio Errore" fullWidth multiline rows={3} />
    <TextInput source="sparkUiUrl" label="Spark UI URL" fullWidth />
    <TextInput source="logsPath" label="Path Log" fullWidth />
  </>
)

export const SparkJobExecutionCreate = () => (
  <Create redirect="list">
    <SimpleForm><SparkJobExecutionForm /></SimpleForm>
  </Create>
)

const EditToolbar = () => (
  <Toolbar sx={{ justifyContent: 'space-between' }}>
    <SaveButton />
    <DeleteButton />
  </Toolbar>
)

export const SparkJobExecutionEdit = () => (
  <Edit>
    <SimpleForm toolbar={<EditToolbar />}><SparkJobExecutionForm /></SimpleForm>
  </Edit>
)
