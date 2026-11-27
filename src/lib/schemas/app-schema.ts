 
import { DrizzleAppSchema  } from '@powersync/drizzle-driver';
import { data_types, dataTypeRelations } from './data-type-schema';
import { tables, tablesRelations } from './table-schema';
import { fields, fieldsRelations } from './field-schema';
import { relationshipRelations, relationships } from './relationship-schema';
import { databaseRelations, databases } from './database-schema';
import { indices, indicesRlationships } from './index-schema';
import { field_indices, fieldIndicesRelationships } from './field_index-schema';
import { studio_document } from './studio-document-schema';

// Separate the native Drizzle schema and the PowerSync descriptor
export const drizzleSchema = {
  data_types,
  tables,
  fields,
  relationships,
  databases,
  indices,
  field_indices,
  studio_document,
  // relationships
  tablesRelations,
  fieldsRelations,
  relationshipRelations,
  dataTypeRelations,
  databaseRelations,
  indicesRlationships,
  fieldIndicesRelationships,
};

// PowerSync descriptor for the local-only studio_document table
export const studioDocumentDescriptor = {
  tableDefinition: studio_document,
  options: { localOnly: true },
};

// AppSchema uses the descriptor map
export const AppSchema = new DrizzleAppSchema({
    data_types: { tableDefinition: data_types },
    tables: { tableDefinition: tables },
    fields: { tableDefinition: fields },
    relationships: { tableDefinition: relationships },
    databases: { tableDefinition: databases },
    indices: { tableDefinition: indices },
    field_indices: { tableDefinition: field_indices },
    studio_document: studioDocumentDescriptor,
});
