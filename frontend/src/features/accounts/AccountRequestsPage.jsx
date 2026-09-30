import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCOUNT_REQUEST_STATUSES } from '../../api/accountService.js';
import { useAccountRequests } from '../../hooks/useAccountRequests.js';
import { formatDate } from '../../lib/format.js';
import Badge, { statusTone } from '../../components/ui/Badge.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';

/** Filter options, with an "all" entry. `null` means no status parameter. */
const FILTERS = [
  { value: null, label: 'All' },
  ...ACCOUNT_REQUEST_STATUSES.map((status) => ({ value: status, label: status })),
];

/**
 * The officer's account-opening queue.
 *
 * Every row links to its own review screen rather than opening a decision
 * dialog here. Deciding on a request means reading the applicant's name, PAN,
 * date of birth and branch and checking them, and there is not room to do that
 * in a popover over a list - so the queue's only job is to be a queue.
 *
 * The status filter is sent to the server rather than applied to the rows here.
 * Filtering client-side would work identically for this list, and would also
 * quietly cap it at whatever the server chose to send, which is not the same
 * thing as the queue the server would produce for a given status.
 */
export default function AccountRequestsPage() {
  const [status, setStatus] = useState(null);
  const { data: requests, isPending, isFetching, error, refetch } = useAccountRequests(status);

  const rows = requests ?? [];

  if (isPending) {
    return <Spinner className="mx-auto mt-24 size-8" label="Loading requests" />;
  }

  if (error) {
    return (
      <Alert tone="danger" title="Could not load account requests">
        <p>{error.message}</p>
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={refetch}>
            Try again
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        title="Account requests"
        description="Applications to open a bank account, awaiting or past a decision."
        actions={
          <Button variant="secondary" onClick={refetch} busy={isFetching}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">Show</span>
        {FILTERS.map((filter) => {
          const selected = filter.value === status;
          return (
            <Button
              key={filter.label}
              size="sm"
              variant={selected ? 'primary' : 'secondary'}
              aria-pressed={selected}
              onClick={() => setStatus(filter.value)}
            >
              {filter.label}
            </Button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="Requests"
          description={`${rows.length} ${rows.length === 1 ? 'request' : 'requests'}${
            status ? ` with status ${status}` : ''
          }`}
        />
        <CardBody className="p-0">
          <DataTable
            caption="Account-opening requests with applicant details and review actions"
            rows={rows}
            rowKey={(request) => request.requestId}
            emptyState={
              <EmptyState
                title="No requests to show"
                description={
                  status
                    ? `No account-opening request is currently ${status.toLowerCase()}.`
                    : 'Requests will appear here as customers apply for an account.'
                }
              />
            }
            columns={[
              {
                key: 'requestId',
                header: 'Request',
                render: (request) => (
                  <span className="font-mono text-xs">#{request.requestId}</span>
                ),
              },
              {
                key: 'fullName',
                header: 'Applicant',
                render: (request) => (
                  <div>
                    <p className="text-sm font-medium text-slate-900">{request.fullName}</p>
                    <p className="text-xs text-slate-500">{request.email}</p>
                  </div>
                ),
              },
              {
                // Unmasked here on purpose: the backend only sends a full PAN to
                // /api/admin/**, because checking it against the documents is
                // the one task that needs it.
                key: 'panNo',
                header: 'PAN',
                render: (request) => <span className="font-mono text-xs">{request.panNo}</span>,
              },
              {
                key: 'branchCode',
                header: 'Branch',
                render: (request) => request.branchCode,
              },
              {
                key: 'requestedAt',
                header: 'Requested',
                render: (request) => formatDate(request.requestedAt),
              },
              {
                key: 'status',
                header: 'Status',
                render: (request) => (
                  <Badge tone={statusTone(request.status)}>
                    {request.status.charAt(0) + request.status.slice(1).toLowerCase()}
                  </Badge>
                ),
              },
              {
                key: 'actions',
                header: 'Action',
                render: (request) => (
                  <Link
                    to={`/accounts/requests/${request.requestId}`}
                    className="text-sm font-medium text-brand-700 underline hover:text-brand-800"
                  >
                    Review
                  </Link>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
