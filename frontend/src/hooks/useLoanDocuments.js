import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listLoanDocuments, uploadLoanDocument } from '../api/documentService.js';

/**
 * Query key for one loan's documents.
 *
 * Scoped by loan id, not a flat `['documents']`, because documents belong to the
 * application they support. Two loans can each have their own set, and a shared
 * key would make an upload to one invalidate - and briefly show - the other's.
 */
export const loanDocumentsKey = (loanId) => ['loans', String(loanId), 'documents'];

/**
 * The documents attached to a loan.
 *
 * Disabled until a loan id exists, which is always: the loan is created first
 * and its id is what these endpoints are keyed by. Before that there is nothing
 * to ask for, and the panel has nothing to list.
 */
export function useLoanDocuments(loanId) {
  return useQuery({
    queryKey: loanDocumentsKey(loanId),
    queryFn: () => listLoanDocuments(loanId),
    // No staleTime here, unlike the loan queries. A document upload is a change
    // the user is watching happen, and a cached list would sit there looking
    // stale after one.
    enabled: Boolean(loanId),
  });
}

/**
 * Uploads a document and refreshes that loan's list.
 *
 * The list is refetched from the server rather than appended to locally. The
 * response describes the stored document - its generated id, its size, its
 * PENDING status - and the list is ordered by upload time, so inserting the new
 * row client-side would mean reimplementing the server's ordering to get the
 * same answer.
 */
export function useUploadLoanDocument(loanId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, documentType }) => uploadLoanDocument(loanId, { file, documentType }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: loanDocumentsKey(loanId) }),
  });
}
