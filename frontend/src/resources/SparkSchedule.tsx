import {
  List, Datagrid, TextField, BooleanField, DateField,
  ReferenceField,
  Show, SimpleShowLayout,
  Create, Edit, SimpleForm, TextInput, BooleanInput, DateTimeInput,
  ReferenceInput, SelectInput, SearchInput,
  TopToolbar, CreateButton, FilterButton, ExportButton,
  Toolbar, SaveButton, DeleteButton,
  required, maxLength,
} from 'react-admin'

const scheduleFilters = [
  <SearchInput source="q" alwaysOn placeholder="Cerca per nome..." />,
]

const ListActions = () => (
  <TopToolbar>
    <FilterButton />
    <CreateButton />
    <ExportButton />
  </TopToolbar>
)

export const SparkScheduleList = () => (
  <List
    filters={scheduleFilters}
    actions={<ListActions />}
    sort={{ field: 'id', order: 'DESC' }}
    perPage={25}
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" label="ID" />
      <ReferenceField source="sparkJobId" reference="spark-jobs" label="Job">
        <TextField source="jobName" />
      </ReferenceField>
      <TextField source="scheduleName" label="Nome Schedule" />
      <TextField source="cronExpr" label="Cron Expression" />
      <BooleanField source="enabled" label="Abilitata" />
      <DateField source="lastRunAt" label="Ultima Esecuzione" showTime />
      <DateField source="nextRunAt" label="Prossima Esecuzione" showTime />
      <DateField source="createdAt" label="Creata" showTime />
    </Datagrid>
  </List>
)

export const SparkScheduleShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" label="ID" />
      <ReferenceField source="sparkJobId" reference="spark-jobs" label="Job Spark">
        <TextField source="jobName" />
      </ReferenceField>
      <TextField source="scheduleName" label="Nome Schedule" />
      <TextField source="cronExpr" label="Cron Expression" />
      <BooleanField source="enabled" label="Abilitata" />
      <TextField source="description" label="Descrizione" />
      <DateField source="lastRunAt" label="Ultima Esecuzione" showTime />
      <DateField source="nextRunAt" label="Prossima Esecuzione" showTime />
      <DateField source="createdAt" label="Creata il" showTime />
      <DateField source="updatedAt" label="Aggiornata il" showTime />
    </SimpleShowLayout>
  </Show>
)

const SparkScheduleForm = () => (
  <>
    <ReferenceInput source="sparkJobId" reference="spark-jobs" label="Job Spark">
      <SelectInput optionText="jobName" validate={required()} fullWidth />
    </ReferenceInput>
    <TextInput source="scheduleName" label="Nome Schedule" validate={[required(), maxLength(255)]} fullWidth />
    <TextInput source="cronExpr" label="Cron Expression" validate={[required(), maxLength(100)]} fullWidth
      helperText="es. 0 2 * * * (ogni giorno alle 2:00)" />
    <BooleanInput source="enabled" label="Abilitata" defaultValue={true} />
    <TextInput source="description" label="Descrizione" validate={[maxLength(1000)]} fullWidth multiline rows={3} />
    <DateTimeInput source="lastRunAt" label="Ultima Esecuzione" />
    <DateTimeInput source="nextRunAt" label="Prossima Esecuzione" />
  </>
)

export const SparkScheduleCreate = () => (
  <Create redirect="list">
    <SimpleForm><SparkScheduleForm /></SimpleForm>
  </Create>
)

const EditToolbar = () => (
  <Toolbar sx={{ justifyContent: 'space-between' }}>
    <SaveButton />
    <DeleteButton />
  </Toolbar>
)

export const SparkScheduleEdit = () => (
  <Edit>
    <SimpleForm toolbar={<EditToolbar />}><SparkScheduleForm /></SimpleForm>
  </Edit>
)
