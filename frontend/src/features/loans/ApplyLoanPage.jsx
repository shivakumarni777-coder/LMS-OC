import { useAuth } from '../../auth/AuthProvider.jsx';
import { useAccountStatus } from '../../hooks/useAccount.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Spinner from '../../components/ui/FullPageSpinner.jsx';
import OpenAccountPanel from '../accounts/OpenAccountPanel.jsx';
import LoanApplicationForm from './LoanApplicationForm.jsx';

/**
 * Apply for a loan.
 *
 * A loan is recorded against a customer account number, so a customer who has no
 * account cannot have an application recorded at all. Rendering the form anyway
 * would let them fill in four fields only to be refused with a message about
 * something they had no way of knowing, so the page asks whether they have an
 * account first and offers the step that unblocks them if not.
 *
 * The check is only made for a customer. An administrator's own account status is
 * irrelevant here - they have no customer account and cannot request one - but
 * they do apply, on a customer's behalf, so they keep the form.
 *
 * @param {string|number} [defaultAccountNumber] - passed through for applying
 *   against a specific account
 */
export default function ApplyLoanPage({ defaultAccountNumber }) {
  const { isAdmin } = useAuth();
  const status = useAccountStatus({ enabled: !isAdmin });

  if (isAdmin) {
    return (
      <Layout>
        <LoanApplicationForm accountNumber={defaultAccountNumber} />
      </Layout>
    );
  }

  if (status.isPending) {
    return (
      <Layout>
        <Spinner className="mx-auto mt-16 size-8" label="Checking your account" />
      </Layout>
    );
  }

  if (status.error) {
    return (
      <Layout>
        <Alert tone="danger" title="Could not check your account status">
          {status.error.message}
        </Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      {status.data?.hasBankAccount ? (
        <LoanApplicationForm
          accountNumber={defaultAccountNumber ?? status.data.accountNumber}
        />
      ) : (
        <OpenAccountPanel />
      )}
    </Layout>
  );
}

function Layout({ children }) {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Apply for a loan"
        description="Applications are reviewed by an administrator before they are approved."
      />
      {children}
    </div>
  );
}
