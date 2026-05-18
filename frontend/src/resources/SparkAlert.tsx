import {
  List, Datagrid, TextField, BooleanField, DateField,
  ReferenceField,
  Show, SimpleShowLayout,
  Create, Edit, SimpleForm, TextInput, BooleanInput, DateTimeInput,
  ReferenceInput, SelectInput, SelectArrayInput,
  TopToolbar, CreateButton, FilterButton, ExportButton,
  Toolbar, SaveButton, DeleteButton,
  required, maxLength,
} from 'react-admin'

const SEVERITY_CHOICES = [
  { id: 'INFO',     name: 'Info' },
  { id: 'WARNING',  name: 'Warning' },
  { id: 'ERROR',    name: 'Error' },
  { id: 'CRITICAL', name: 'Critical' },
]

const SEVERITY_COLORS: Record<string, string> = {
  INFO:     '#1565c0',
  WARNING:  '#f57c00',
  ERROR:    '#c62828',
  CRITICAL: '#880e4f',
}

const alertFilters = [
  <SelectArrayInput source="severity" label="Severità" choices={SEVERITY_CHOICES} alwaysOn />,
]

const ListActions = () => (
  <TopToolbar>
    <FilterButton />
    <CreateButton />
    <ExportButton />
  </TopToolbar>
)

export const SparkAlertList = () => (
  <List
    filters={alertFilters}
    actions={<ListActions />}
    sort={{ field: 'id', order: 'DESC' }}
    perPage={25}
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" label="ID" />
      <ReferenceField source="sparkJobId" reference="spark-jobs" label="Job">
        <TextField source="jobName" />
      </ReferenceField>
      <TextField source="alertType" label="Tipo" />
      <TextField source="severity" label="Severità" />
      <TextField source="message" label="Messaggio" />
      <BooleanField source="resolved" label="Risolto" />
      <DateField source="resolvedAt" label="Risolto il" showTime />
      <DateField source="createdAt" label="Creato" showTime />
    </Datagrid>
  </List>
)

export const SparkAlertShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" label="ID" />
      <ReferenceField source="sparkJobId" reference="spark-jobs" label="Job Spark">
        <TextField source="jobName" />
      </ReferenceField>
      <TextField source="alertType" label="Tipo Alert" />
      <TextField source="severity" label="Severità" />
      <TextField source="message" label="Messaggio" />
      <BooleanField source="resolved" label="Risolto" />
      <DateField source="resolvedAt" label="Risolto il" showTime />
      <DateField source="createdAt" label="Creato il" showTime />
      <DateField source="updatedAt" label="Aggiornato il" showTime />
    </SimpleShowLayout>
  </Show>
)

const SparkAlertForm = () => (
  <>
    <ReferenceInput source="sparkJobId" reference="spark-jobs" label="Job Spark">
      <SelectInput optionText="jobName" fullWidth />
    </ReferenceInput>
    <TextInput source="alertType" label="Tipo Alert" validate={[required(), maxLength(100)]} fullWidth />
    <SelectInput source="severity" label="Severità" choices={SEVERITY_CHOICES} validate={required()} />
    <TextInput source="message" label="Messaggio" validate={[required(), maxLength(2000)]} fullWidth multiline rows={4} />
    <BooleanInput source="resolved" label="Risolto" defaultValue={false} />
    <DateTimeInput source="resolvedAt" label="Risolto il" />
  </>
)

export const SparkAlertCreate = () => (
  <Create redirect="list">
    <SimpleForm><SparkAlertForm /></SimpleForm>
  </Create>
)

const EditToolbar = () => (
  <Toolbar sx={{ justifyContent: 'space-between' }}>
    <SaveButton />
    <DeleteButton />
  </Toolbar>
)

export const SparkAlertEdit = () => (
  <Edit>
    <SimpleForm toolbar={<EditToolbar />}><SparkAlertForm /></SimpleForm>
  </Edit>
)
