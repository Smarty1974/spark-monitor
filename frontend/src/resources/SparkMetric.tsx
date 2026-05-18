import {
  List, Datagrid, TextField, NumberField, DateField,
  ReferenceField,
  Show, SimpleShowLayout,
  Create, Edit, SimpleForm, TextInput, NumberInput, DateTimeInput,
  ReferenceInput, SelectInput,
  TopToolbar, CreateButton, ExportButton,
  Toolbar, SaveButton, DeleteButton,
  required, maxLength,
} from 'react-admin'

const ListActions = () => (
  <TopToolbar>
    <CreateButton />
    <ExportButton />
  </TopToolbar>
)

export const SparkMetricList = () => (
  <List
    actions={<ListActions />}
    sort={{ field: 'recorded_at', order: 'DESC' }}
    perPage={25}
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" label="ID" />
      <ReferenceField source="executionId" reference="spark-job-executions" label="Esecuzione">
        <TextField source="executionNumber" />
      </ReferenceField>
      <TextField source="metricName" label="Metrica" />
      <NumberField source="metricValue" label="Valore" options={{ maximumFractionDigits: 4 }} />
      <TextField source="metricUnit" label="Unità" />
      <TextField source="stage" label="Stage" />
      <DateField source="recordedAt" label="Registrata" showTime />
    </Datagrid>
  </List>
)

export const SparkMetricShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" label="ID" />
      <ReferenceField source="executionId" reference="spark-job-executions" label="Esecuzione">
        <TextField source="executionNumber" />
      </ReferenceField>
      <TextField source="metricName" label="Nome Metrica" />
      <NumberField source="metricValue" label="Valore" options={{ maximumFractionDigits: 4 }} />
      <TextField source="metricUnit" label="Unità" />
      <TextField source="stage" label="Stage" />
      <DateField source="recordedAt" label="Registrata il" showTime />
      <DateField source="createdAt" label="Creata il" showTime />
    </SimpleShowLayout>
  </Show>
)

const SparkMetricForm = () => (
  <>
    <ReferenceInput source="executionId" reference="spark-job-executions" label="Esecuzione">
      <SelectInput optionText="executionNumber" validate={required()} fullWidth />
    </ReferenceInput>
    <TextInput source="metricName" label="Nome Metrica" validate={[required(), maxLength(255)]} fullWidth />
    <NumberInput source="metricValue" label="Valore" validate={required()} />
    <TextInput source="metricUnit" label="Unità di Misura" validate={[maxLength(50)]} />
    <TextInput source="stage" label="Stage Spark" validate={[maxLength(100)]} />
    <DateTimeInput source="recordedAt" label="Registrata il" validate={required()} />
  </>
)

export const SparkMetricCreate = () => (
  <Create redirect="list">
    <SimpleForm><SparkMetricForm /></SimpleForm>
  </Create>
)

const EditToolbar = () => (
  <Toolbar sx={{ justifyContent: 'space-between' }}>
    <SaveButton />
    <DeleteButton />
  </Toolbar>
)

export const SparkMetricEdit = () => (
  <Edit>
    <SimpleForm toolbar={<EditToolbar />}><SparkMetricForm /></SimpleForm>
  </Edit>
)
