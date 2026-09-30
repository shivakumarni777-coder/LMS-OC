package com.bank.lms.controller;

import com.bank.lms.dto.LoanDocumentDto;
import com.bank.lms.security.AuthenticatedUser;
import com.bank.lms.service.LoanDocumentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Uploading and reading the documents attached to a loan application.
 *
 * <p>Uploads take {@code documentType} as a plain request parameter rather than
 * a JSON body, because the request is {@code multipart/form-data} and Spring
 * cannot bind both reliably in one part. It is free text: the system declares no
 * mandatory set of document types, so the field is a description for whoever
 * reviews the file rather than a value from a fixed vocabulary.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class LoanDocumentController {

    private final LoanDocumentService loanDocumentService;

    /** Owner of the loan, or an officer. */
    @PostMapping(value = "/loans/{loanId}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public LoanDocumentDto.Response upload(
            @PathVariable Long loanId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "documentType", required = false) String documentType,
            @AuthenticationPrincipal AuthenticatedUser caller) {
        return loanDocumentService.upload(loanId, file, documentType, caller);
    }

    @GetMapping("/loans/{loanId}/documents")
    public List<LoanDocumentDto.Response> listForLoan(
            @PathVariable Long loanId, @AuthenticationPrincipal AuthenticatedUser caller) {
        return loanDocumentService.listForLoan(loanId, caller);
    }

    /**
     * Streams a document back.
     *
     * <p>Keyed by document id rather than by loan id and filename, because the
     * stored name is generated server-side and the client has no way to know it.
     * {@code inline} is left off so the browser downloads rather than rendering:
     * an uploaded file is untrusted, and rendering one in the origin's context
     * is how an uploaded document becomes a script running as an officer.
     */
    @GetMapping("/documents/{documentId}/download")
    public ResponseEntity<org.springframework.core.io.Resource> download(
            @PathVariable Long documentId, @AuthenticationPrincipal AuthenticatedUser caller) {

        LoanDocumentService.Download download = loanDocumentService.download(documentId, caller);

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(download.contentType()))
                .contentLength(download.sizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(download.fileName(), StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .body(download.resource());
    }
}
