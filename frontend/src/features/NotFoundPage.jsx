import { Link } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-mono text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        That address does not match anything in the portal.
      </p>
      <div className="mt-6 flex justify-center">
        <Link to="/">
          <Button>Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
