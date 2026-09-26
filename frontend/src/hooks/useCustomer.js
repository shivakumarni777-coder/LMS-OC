import { useQuery } from '@tanstack/react-query';
import { getCustomerByAccount, getCustomerLoans } from '../api/customerService.js';

/**
 * Customer details plus their loan portfolio.
 *
 * The two requests are independent, so they are issued together by two query
 * hooks rather than one handler awaiting them in sequence. React Query starts
 * each on mount, which removes the waterfall.
 *
 * @param accountNumber string - the number typed by the user; kept as a string
 *   so a 12-digit value never passes through a float.
 */
export function useCustomer(accountNumber) {
  const loans = useCustomerLoans(accountNumber);

  const customer = useQuery({
    queryKey: ['customer', accountNumber],
    queryFn: () => getCustomerByAccount(accountNumber),
    enabled: Boolean(accountNumber),
    staleTime: 60_000,
  });

  return { customer, loans };
}

export function useCustomerLoans(accountNumber) {
  return useQuery({
    queryKey: ['customer', accountNumber, 'loans'],
    queryFn: () => getCustomerLoans(accountNumber),
    enabled: Boolean(accountNumber),
    staleTime: 30_000,
  });
}
