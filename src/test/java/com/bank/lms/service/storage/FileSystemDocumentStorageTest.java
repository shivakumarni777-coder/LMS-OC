package com.bank.lms.service.storage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The filesystem storage against a real temporary directory.
 *
 * <p>Mocking this class would test nothing worth testing: the whole of its
 * behaviour is in how it turns a key into a path and what it does with a path
 * that should not exist. So it is exercised for real, on a directory the test
 * owns and the OS removes afterwards.
 */
class FileSystemDocumentStorageTest {

    @TempDir
    Path root;

    private FileSystemDocumentStorage storage() {
        return new FileSystemDocumentStorage(root.toString());
    }

    private static InputStream bytes(String content) {
        return new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8));
    }

    private static String readAll(InputStream in) throws IOException {
        return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("a stored document reads back byte for byte")
    void storedDocumentReadsBackUnchanged() throws IOException {
        FileSystemDocumentStorage storage = storage();
        String content = "%PDF-1.7 a payroll slip, not text you can eyeball";

        String key = storage.store(Path.of("loans", "12"), "application/pdf", bytes(content));

        try (InputStream in = storage.read(key)) {
            assertEquals(content, readAll(in));
        }
        assertTrue(storage.exists(key));
    }

    @Test
    @DisplayName("binary content survives the round trip intact")
    void binaryContentSurvives() throws IOException {
        FileSystemDocumentStorage storage = storage();
        byte[] content = new byte[4096];
        for (int i = 0; i < content.length; i++) {
            content[i] = (byte) i;
        }

        String key = storage.store(Path.of("loans", "1"), "image/png",
                new ByteArrayInputStream(content));

        try (InputStream in = storage.read(key)) {
            assertArrayEquals(content, in.readAllBytes());
        }
    }

    @Test
    @DisplayName("the extension comes from the content type, not the uploaded filename")
    void extensionComesFromContentType() throws IOException {
        FileSystemDocumentStorage storage = storage();

        String key = storage.store(Path.of("loans", "3"), "application/pdf", bytes("x"));

        // The name is entirely generated, so the extension can only have come
        // from the declared type.
        assertTrue(key.endsWith(".pdf"), key);
    }

    @Test
    @DisplayName("an unrecognised content type gets no guessed extension")
    void unknownContentTypeGetsNoExtension() throws IOException {
        FileSystemDocumentStorage storage = storage();

        String key = storage.store(Path.of("loans", "3"), "application/x-made-up", bytes("x"));

        assertFalse(key.contains("."), key);
    }

    @Test
    @DisplayName("two documents for one loan get different keys")
    void keysAreUnique() throws IOException {
        FileSystemDocumentStorage storage = storage();

        String first = storage.store(Path.of("loans", "7"), "application/pdf", bytes("a"));
        String second = storage.store(Path.of("loans", "7"), "application/pdf", bytes("a"));

        // Same loan, same content type, same bytes - and still distinct files, so
        // a second upload cannot quietly overwrite the first.
        assertNotEquals(first, second);
        assertTrue(Files.exists(root.resolve(first)));
        assertTrue(Files.exists(root.resolve(second)));
    }

    @Test
    @DisplayName("the loan's directory is created on first upload")
    void loanDirectoryIsCreated() throws IOException {
        FileSystemDocumentStorage storage = storage();

        String key = storage.store(Path.of("loans", "999"), "application/pdf", bytes("x"));

        assertTrue(Files.isDirectory(root.resolve("loans").resolve("999")));
        assertTrue(Files.exists(root.resolve(key)));
    }

    @Test
    @DisplayName("a key that climbs out of the root is refused")
    void traversalKeyIsRefused() throws IOException {
        FileSystemDocumentStorage storage = storage();
        Path secret = root.resolveSibling("not-ours.txt");
        Files.writeString(secret, "private");

        try {
            // A key like this can only enter the database from outside the
            // application - a restored backup, a manual fix - which is exactly
            // why the check is on read as well as on write.
            assertThrows(IllegalArgumentException.class, () -> storage.read("../not-ours.txt"));
            assertThrows(IllegalArgumentException.class,
                    () -> storage.store(Path.of("../escaped"), "application/pdf", bytes("x")));
            assertThrows(IllegalArgumentException.class, () -> storage.delete("../not-ours.txt"));

            // exists() is a question, so it answers no rather than throwing.
            assertFalse(storage.exists("../not-ours.txt"));
        } finally {
            Files.deleteIfExists(secret);
        }
    }

    @Test
    @DisplayName("a deeply nested traversal is still refused after normalisation")
    void nestedTraversalIsRefused() {
        FileSystemDocumentStorage storage = storage();

        // normalise() collapses this to a path outside the root, which is why
        // the startsWith check runs after normalising rather than before.
        assertThrows(IllegalArgumentException.class, () -> storage.read("loans/../../elsewhere.pdf"));
    }

    @Test
    @DisplayName("deleting removes the bytes, and deleting twice is not an error")
    void deleteIsIdempotent() throws IOException {
        FileSystemDocumentStorage storage = storage();
        String key = storage.store(Path.of("loans", "4"), "application/pdf", bytes("x"));

        storage.delete(key);
        assertFalse(storage.exists(key));

        // Rolling back a partially-completed upload must not have to know
        // whether the write ever landed.
        storage.delete(key);
    }

    @Test
    @DisplayName("the storage root is created when it does not exist")
    void rootIsCreatedOnConstruction() {
        Path nested = root.resolve("deep").resolve("nested").resolve("root");

        new FileSystemDocumentStorage(nested.toString());

        assertTrue(Files.isDirectory(nested));
    }
}
