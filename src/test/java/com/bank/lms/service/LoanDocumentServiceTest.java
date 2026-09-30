package com.bank.lms.service;

import com.bank.lms.dto.LoanDocumentDto;
import com.bank.lms.entity.AppRole;
import com.bank.lms.entity.AppUser;
import com.bank.lms.entity.Customer;
import com.bank.lms.entity.Loan;
import com.bank.lms.entity.LoanDocument;
import com.bank.lms.entity.LoanDocumentStatus;
import com.bank.lms.entity.LoanStatus;
import com.bank.lms.exception.InvalidRequestException;
import com.bank.lms.exception.ResourceNotFoundException;
import com.bank.lms.repository.LoanDocumentRepository;
import com.bank.lms.repository.LoanRepository;
import com.bank.lms.security.AuthenticatedUser;
import com.bank.lms.service.storage.DocumentStorage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.InputStreamResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LoanDocumentServiceTest {

    private static final Long LOAN_ID = 5L;
    private static final Long ACCOUNT_NUMBER = 304012345678L;
    private static final String STORAGE_KEY = "loans/5/9f2c-key.pdf";

    @Mock
    private LoanRepository loanRepository;

    @Mock
    private LoanDocumentRepository loanDocumentRepository;

    @Mock
    private DocumentStorage documentStorage;

    @InjectMocks
    private LoanDocumentService service;

    private static Loan loanFor(Long accountNumber) {
        Customer customer = new Customer();
        customer.setAccountNumber(accountNumber);
        Loan loan = new Loan();
        loan.setLoanId(LOAN_ID);
        loan.setCustomer(customer);
        loan.setLoanType("HOME");
        loan.setPrincipalAmount(new BigDecimal("5000000"));
        loan.setInterestRate(new BigDecimal("8.50"));
        loan.setLoanStatus(LoanStatus.PENDING.name());
        return loan;
    }

    private static AuthenticatedUser principal(AppRole role, Long accountNumber) {
        return new AuthenticatedUser(AppUser.builder()
                .userId(1L)
                .username("someone@example.com")
                .passwordHash("irrelevant")
                .role(role)
                .accountNumber(accountNumber)
                .enabled(true)
                .build());
    }

    private static AuthenticatedUser owner() {
        return principal(AppRole.CUSTOMER, ACCOUNT_NUMBER);
    }

    private static AuthenticatedUser admin() {
        return principal(AppRole.ADMIN, null);
    }

    private static MultipartFile file(String name, String type, String content) {
        return new MockMultipartFile("file", name, type, content.getBytes(StandardCharsets.UTF_8));
    }

    private void stubLoan() {
        when(loanRepository.findById(LOAN_ID)).thenReturn(Optional.of(loanFor(ACCOUNT_NUMBER)));
    }

    private void stubStoredKey() throws IOException {
        when(documentStorage.store(any(), anyString(), any()))
                .thenReturn(STORAGE_KEY);
    }

    private void stubSavedDocument() {
        when(loanDocumentRepository.save(any(LoanDocument.class))).thenAnswer(inv -> {
            LoanDocument saved = inv.getArgument(0);
            saved.setDocumentId(77L);
            return saved;
        });
    }

    // ----------------------------------------------------------------- upload

    @Test
    @DisplayName("an upload records the document against its loan")
    void uploadRecordsTheDocument() throws IOException {
        stubLoan();
        stubStoredKey();
        stubSavedDocument();

        LoanDocumentDto.Response response = service.upload(
                LOAN_ID, file("september-slip.pdf", "application/pdf", "content"),
                "SALARY_SLIP", owner());

        ArgumentCaptor<LoanDocument> saved = ArgumentCaptor.forClass(LoanDocument.class);
        verify(loanDocumentRepository).save(saved.capture());

        assertEquals(LOAN_ID, saved.getValue().getLoanId());
        assertEquals("SALARY_SLIP", saved.getValue().getDocumentType());
        assertEquals("september-slip.pdf", saved.getValue().getDocumentName());
        assertEquals("application/pdf", saved.getValue().getContentType());
        assertEquals(STORAGE_KEY, saved.getValue().getStorageKey());
        assertEquals(LoanDocumentStatus.PENDING, saved.getValue().getStatus());
        assertEquals(77L, response.documentId());
    }

    @Test
    @DisplayName("the storage key is generated by storage, so no client-chosen path is stored")
    void storageKeyComesFromStorage() throws IOException {
        stubLoan();
        stubStoredKey();
        stubSavedDocument();

        service.upload(LOAN_ID, file("../../escape.pdf", "application/pdf", "x"),
                "OTHER", owner());

        // The filename is kept as a label only. The key is whatever storage
        // decided, which is what keeps a crafted name from becoming a path.
        ArgumentCaptor<LoanDocument> saved = ArgumentCaptor.forClass(LoanDocument.class);
        verify(loanDocumentRepository).save(saved.capture());

        assertEquals(STORAGE_KEY, saved.getValue().getStorageKey());
        assertEquals("escape.pdf", saved.getValue().getDocumentName(),
                "the directory component is stripped from the label");
    }

    @Test
    @DisplayName("documents are grouped under their own loan")
    void documentsAreGroupedByLoan() throws IOException {
        stubLoan();
        stubStoredKey();
        stubSavedDocument();

        service.upload(LOAN_ID, file("a.pdf", "application/pdf", "x"), "OTHER", owner());

        ArgumentCaptor<java.nio.file.Path> directory =
                ArgumentCaptor.forClass(java.nio.file.Path.class);
        verify(documentStorage).store(directory.capture(), anyString(), any());

        assertEquals(java.nio.file.Path.of("loans", "5"), directory.getValue());
    }

    @Test
    @DisplayName("a failed metadata write deletes the uploaded bytes")
    void failedRowWriteCleansUpTheBytes() throws IOException {
        stubLoan();
        stubStoredKey();
        when(loanDocumentRepository.save(any(LoanDocument.class)))
                .thenThrow(new IllegalStateException("constraint violated"));

        assertThrows(IllegalStateException.class, () -> service.upload(
                LOAN_ID, file("a.pdf", "application/pdf", "x"), "OTHER", owner()));

        // Without this the store would accumulate files no row refers to and no
        // one can see or delete.
        verify(documentStorage).delete(STORAGE_KEY);
    }

    @Test
    @DisplayName("a storage failure is reported without a dangling row")
    void storageFailureRecordsNothing() throws IOException {
        stubLoan();
        when(documentStorage.store(any(), anyString(), any()))
                .thenThrow(new IOException("disk full"));

        InvalidRequestException thrown = assertThrows(InvalidRequestException.class, () -> service.upload(
                LOAN_ID, file("a.pdf", "application/pdf", "x"), "OTHER", owner()));

        assertTrue(thrown.getMessage().toLowerCase().contains("try again"), thrown.getMessage());
        verify(loanDocumentRepository, never()).save(any());
    }

    @Test
    @DisplayName("an empty file is refused")
    void emptyFileIsRefused() {
        stubLoan();

        assertThrows(InvalidRequestException.class, () -> service.upload(
                LOAN_ID, file("a.pdf", "application/pdf", ""), "OTHER", owner()));

        verify(loanDocumentRepository, never()).save(any());
    }

    @Test
    @DisplayName("an undescribed document is refused, because an officer cannot triage it")
    void blankDocumentTypeIsRefused() {
        stubLoan();

        assertThrows(InvalidRequestException.class, () -> service.upload(
                LOAN_ID, file("a.pdf", "application/pdf", "x"), "   ", owner()));

        verify(loanDocumentRepository, never()).save(any());
    }

    @Test
    @DisplayName("an arbitrarily described document is accepted, since types are free text")
    void freeTextDocumentTypeIsAccepted() throws IOException {
        stubLoan();
        stubStoredKey();
        stubSavedDocument();

        service.upload(LOAN_ID, file("a.pdf", "application/pdf", "x"),
                "Hand-written note from employer", owner());

        ArgumentCaptor<LoanDocument> saved = ArgumentCaptor.forClass(LoanDocument.class);
        verify(loanDocumentRepository).save(saved.capture());
        assertEquals("Hand-written note from employer", saved.getValue().getDocumentType());
    }

    @Test
    @DisplayName("a file with no declared type is stored as an opaque stream")
    void missingContentTypeFallsBack() throws IOException {
        stubLoan();
        stubStoredKey();
        stubSavedDocument();

        service.upload(LOAN_ID, file("a.bin", null, "x"), "OTHER", owner());

        ArgumentCaptor<LoanDocument> saved = ArgumentCaptor.forClass(LoanDocument.class);
        verify(loanDocumentRepository).save(saved.capture());
        assertEquals("application/octet-stream", saved.getValue().getContentType());
    }

    // ------------------------------------------------------------- permissions

    @Test
    @DisplayName("a customer cannot attach a document to someone else's loan")
    void uploadRefusesAForeignLoan() {
        stubLoan();
        AuthenticatedUser other = principal(AppRole.CUSTOMER, 304099999999L);

        // 404 rather than 403, so a wrong owner cannot learn that the loan exists.
        assertThrows(ResourceNotFoundException.class, () -> service.upload(
                LOAN_ID, file("a.pdf", "application/pdf", "x"), "OTHER", other));

        verify(loanDocumentRepository, never()).save(any());
    }

    @Test
    @DisplayName("a customer cannot read another customer's document list")
    void listRefusesAForeignLoan() {
        stubLoan();
        AuthenticatedUser other = principal(AppRole.CUSTOMER, 304099999999L);

        assertThrows(ResourceNotFoundException.class, () -> service.listForLoan(LOAN_ID, other));
        verify(loanDocumentRepository, never()).findByLoanIdOrderByUploadedAtAsc(any());
    }

    @Test
    @DisplayName("an officer can attach a document while reviewing")
    void officerMayUpload() throws IOException {
        stubLoan();
        stubStoredKey();
        stubSavedDocument();

        assertEquals(77L, service.upload(
                LOAN_ID, file("note.pdf", "application/pdf", "x"), "OFFICER_NOTE", admin()).documentId());
    }

    @Test
    @DisplayName("a customer with no account cannot reach any loan")
    void accountLessCustomerIsRefused() {
        stubLoan();
        AuthenticatedUser accountLess = principal(AppRole.CUSTOMER, null);

        assertThrows(ResourceNotFoundException.class,
                () -> service.listForLoan(LOAN_ID, accountLess));
    }

    // ------------------------------------------------------------------ reads

    @Test
    @DisplayName("the document list is returned oldest upload first")
    void listReturnsDocuments() {
        stubLoan();
        LoanDocument document = LoanDocument.builder()
                .documentId(1L).loanId(LOAN_ID).documentType("SALARY_SLIP")
                .documentName("a.pdf").storageKey(STORAGE_KEY)
                .contentType("application/pdf").sizeBytes(10L)
                .status(LoanDocumentStatus.PENDING).uploadedAt(Instant.parse("2026-09-20T10:00:00Z"))
                .build();
        when(loanDocumentRepository.findByLoanIdOrderByUploadedAtAsc(LOAN_ID))
                .thenReturn(List.of(document));

        List<LoanDocumentDto.Response> documents = service.listForLoan(LOAN_ID, owner());

        assertEquals(1, documents.size());
        assertEquals("SALARY_SLIP", documents.getFirst().documentType());
    }

    @Test
    @DisplayName("a download checks ownership through the document's own loan")
    void downloadChecksTheLoansOwner() throws IOException {
        LoanDocument document = LoanDocument.builder()
                .documentId(9L).loanId(LOAN_ID).documentName("a.pdf")
                .storageKey(STORAGE_KEY).contentType("application/pdf").sizeBytes(7L).build();
        when(loanDocumentRepository.findById(9L)).thenReturn(Optional.of(document));
        stubLoan();
        when(documentStorage.read(STORAGE_KEY)).thenReturn(
                new ByteArrayInputStream("content".getBytes(StandardCharsets.UTF_8)));

        LoanDocumentService.Download download = service.download(9L, owner());

        assertEquals("a.pdf", download.fileName());
        assertEquals(7L, download.sizeBytes());
        assertEquals("content",
                new String(download.resource().getInputStream().readAllBytes(), StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("a download is refused when the document belongs to another customer's loan")
    void downloadRefusesAForeignDocument() throws IOException {
        LoanDocument document = LoanDocument.builder()
                .documentId(9L).loanId(LOAN_ID).storageKey(STORAGE_KEY).build();
        when(loanDocumentRepository.findById(9L)).thenReturn(Optional.of(document));
        stubLoan();

        AuthenticatedUser other = principal(AppRole.CUSTOMER, 304099999999L);

        assertThrows(ResourceNotFoundException.class, () -> service.download(9L, other));
        verify(documentStorage, never()).read(anyString());
    }

    @Test
    @DisplayName("a document row whose bytes are gone reads as unavailable, not as a server error")
    void downloadOfMissingBytesIsNotFound() throws IOException {
        LoanDocument document = LoanDocument.builder()
                .documentId(9L).loanId(LOAN_ID).storageKey(STORAGE_KEY).build();
        when(loanDocumentRepository.findById(9L)).thenReturn(Optional.of(document));
        stubLoan();
        when(documentStorage.read(STORAGE_KEY)).thenThrow(new IOException("gone"));

        // The situation is "the document is not available", whatever the reason.
        // A 500 would tell an officer the bank had broken.
        assertThrows(ResourceNotFoundException.class, () -> service.download(9L, owner()));
    }

    @Test
    @DisplayName("the download response wraps a stream rather than buffering the file")
    void downloadStreamsTheContent() throws IOException {
        LoanDocument document = LoanDocument.builder()
                .documentId(9L).loanId(LOAN_ID).storageKey(STORAGE_KEY)
                .contentType("application/pdf").sizeBytes(7L).build();
        when(loanDocumentRepository.findById(9L)).thenReturn(Optional.of(document));
        stubLoan();
        when(documentStorage.read(STORAGE_KEY)).thenReturn(
                new ByteArrayInputStream("content".getBytes(StandardCharsets.UTF_8)));

        LoanDocumentService.Download download = service.download(9L, owner());

        // An InputStreamResource, so a large scan is not held in memory in full
        // just to be sent back.
        assertTrue(download.resource() instanceof InputStreamResource);
    }
}
