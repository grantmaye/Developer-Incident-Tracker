export const stages = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'] as const;
export type Status = (typeof stages)[number];
export type Severity = 'SEV1' | 'SEV2' | 'SEV3';
export type Event = { id: string; kind: string; body: string; at: string; actor: string };
export type Incident = {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  status: Status;
  serviceIds: string[];
  commander: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  version: number;
  rootCause: string;
  followUp: string;
  events: Event[];
};
export const services = [
  { id: 'gateway', name: 'API gateway', region: 'us-east-1', dependsOn: ['identity', 'payments'] },
  { id: 'identity', name: 'Identity', region: 'global', dependsOn: [] },
  { id: 'payments', name: 'Payments', region: 'us-east-1', dependsOn: ['database'] },
  { id: 'database', name: 'Primary database', region: 'us-east-1', dependsOn: [] },
  { id: 'workers', name: 'Job workers', region: 'us-west-2', dependsOn: ['database'] },
];
export const members = ['Grant Maye', 'Alex Chen', 'Jordan Ellis'];
export class DomainError extends Error {
  constructor(
    message: string,
    public code = 'BAD_USER_INPUT',
  ) {
    super(message);
  }
}
