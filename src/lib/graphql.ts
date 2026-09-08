import { ApolloServer } from '@apollo/server';
import { GraphQLError, type ValidationContext } from 'graphql';
import { DomainError } from './model';
import type { Service } from './service';
type Context = { service: Service; workspace: string; role: string };
export const contextFor = (service: Service, workspace: string, role: string): Context => ({
  service,
  workspace,
  role,
});
export function createApi() {
  return new ApolloServer<Context>({
    includeStacktraceInErrorResponses: false,
    typeDefs: `#graphql
 enum Status { INVESTIGATING IDENTIFIED MONITORING RESOLVED }
 enum Severity { SEV1 SEV2 SEV3 }
 type Event { id: ID!, kind:String!, body:String!, at:String!, actor:String! }
 type Incident { id:ID!, title:String!, summary:String!, severity:Severity!, status:Status!, serviceIds:[ID!]!, commander:String!, createdAt:String!, updatedAt:String!, resolvedAt:String, version:Int!, rootCause:String!, followUp:String!, events:[Event!]! }
 type Service { id:ID!, name:String!, region:String!, dependsOn:[ID!]! }
 type Dashboard { incidents:[Incident!]!, services:[Service!]!, members:[String!]!, storageMode:String! }
 type Query { dashboard:Dashboard! }
 input CreateInput { title:String!, summary:String!, severity:Severity!, serviceIds:[ID!]!, commander:String! }
 input UpdateInput { status:Status!, commander:String!, note:String!, rootCause:String!, followUp:String! }
 type Mutation { declareIncident(input:CreateInput!):Incident!, updateIncident(id:ID!, version:Int!, input:UpdateInput!):Incident! }
`,
    validationRules: [
      (c: ValidationContext) => {
        let fields = 0;
        return {
          Field() {
            if (++fields === 151) c.reportError(new GraphQLError('Maximum 150 fields.'));
          },
          FragmentDefinition() {
            c.reportError(new GraphQLError('Fragments are disabled in this bounded demo.'));
          },
          OperationDefinition(n) {
            if (n.operation === 'mutation' && n.selectionSet.selections.length > 1)
              c.reportError(new GraphQLError('One mutation field per request.'));
          },
        };
      },
    ],
    resolvers: {
      Query: {
        dashboard: (_: unknown, __: unknown, c: Context) => c.service.dashboard(c.workspace),
      },
      Mutation: {
        declareIncident: (_: unknown, { input }: { input: unknown }, c: Context) =>
          c.service.create(c.workspace, c.role, input),
        updateIncident: (
          _: unknown,
          { id, version, input }: { id: string; version: number; input: unknown },
          c: Context,
        ) => c.service.update(c.workspace, c.role, id, version, input),
      },
    },
    formatError: (formatted, error) => {
      const original = error instanceof GraphQLError ? error.originalError : null;
      if (original instanceof DomainError)
        return { message: original.message, extensions: { code: original.code } };
      if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        console.error(error);
        return {
          message: 'Unable to complete this operation.',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        };
      }
      return formatted;
    },
  });
}
