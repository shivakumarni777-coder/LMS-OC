package com.bank.lms.service.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

/**
 * Stores documents on the local filesystem, under a configurable root.
 *
 * <p>Suits development and a single VM with a persistent disk. The production
 * target is Azure, and this class is the seam that makes that a later change:
 * the key it returns is a relative path, and a sibling implementation can map
 * the same keys onto a mounted file share or blob container without anything
 * above this layer noticing.
 *
 * <p>Two properties matter more than the storage itself.
 *
 * <p><b>Keys are generated here, never taken from a request.</b> A client that
 * could choose its own key could supply one containing {@code ../} and write
 * outside the root. Every key is built here from the loan id, a random UUID and
 * a filename the caller supplies <em>as metadata only</em>.
 *
 * <p><b>Reads are confined to the root.</b> {@link #resolve} normalises the
 * candidate path and re-checks that it really is under the root, so even a key
 * that somehow reached the database from outside - a restored backup, a manual
 * fix, a future migration - cannot be used to read arbitrary files from the
 * server.
 */
@Component
public class FileSystemDocumentStorage implements DocumentStorage {

    private static final Logger log = LoggerFactory.getLogger(FileSystemDocumentStorage.class);

    private final Path root;

    public FileSystemDocumentStorage(
            @Value("${app.document-storage.root:./data/documents}") String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.root);
        } catch (IOException e) {
            // Failing here rather than on the first upload: a missing root is a
            // configuration problem, and the first upload may be weeks away.
            throw new IllegalStateException("Cannot create document storage root: " + this.root, e);
        }
        log.info("Documents will be stored under {}", this.root);
    }

    @Override
    public String store(Path relativeDirectory, String contentType, InputStream content)
            throws IOException {

        // The directory is fixed by the caller (loans/<id>), but it is resolved
        // through the same confinement check as a read, so nothing depends on
        // that caller being careful.
        Path directory = resolve(relativeDirectory.toString());
        Files.createDirectories(directory);

        // The stored name is entirely generated: a UUID plus an extension
        // implied by the declared content type. A name derived from a
        // user-supplied filename would be a name an attacker can shape, and the
        // original filename is kept as metadata on the row instead.
        String key = relativeDirectory.resolve(
                UUID.randomUUID() + extensionFor(contentType)).normalize().toString();

        Path target = resolve(key);
        Files.copy(content, target, StandardCopyOption.REPLACE_EXISTING);

        log.debug("Stored document under {} as {} ({} bytes)", relativeDirectory, key, Files.size(target));
        return key;
    }

    @Override
    public InputStream read(String key) throws IOException {
        return Files.newInputStream(resolve(key));
    }

    @Override
    public void delete(String key) throws IOException {
        // deleteIfExists, so rolling back a partially-completed upload does not
        // have to know whether the write ever landed.
        Files.deleteIfExists(resolve(key));
    }

    /**
     * Whether the key resolves to something readable in this store.
     *
     * <p>A total predicate: a key that escapes the root answers {@code false}
     * rather than throwing, because callers use this to ask a question about a
     * key they did not construct, and a boolean is a better answer than an
     * exception for "no".
     */
    @Override
    public boolean exists(String key) {
        try {
            return Files.isReadable(resolve(key));
        } catch (IllegalArgumentException outsideRoot) {
            return false;
        }
    }

    /**
     * Resolves a key to an absolute path, refusing anything outside the root.
     *
     * <p>{@code normalize()} alone is not enough: a key of {@code a/../../etc}
     * normalises to a path that is perfectly legal but outside the root. The
     * {@code startsWith} check after normalising is what actually confines it.
     */
    private Path resolve(String key) {
        Path candidate = root.resolve(key).normalize();
        if (!candidate.startsWith(root)) {
            throw new IllegalArgumentException("Refusing to access a path outside the storage root.");
        }
        return candidate;
    }

    /**
     * A filename extension implied by the declared content type.
     *
     * <p>Derived from a closed set rather than from the uploaded filename, so
     * the stored path carries no attacker-controlled text at all. An unknown
     * type gets no extension rather than a guessed one.
     */
    private static String extensionFor(String contentType) {
        if (contentType == null) {
            return "";
        }
        return switch (contentType.toLowerCase(java.util.Locale.ROOT)) {
            case "application/pdf" -> ".pdf";
            case "image/jpeg", "image/jpg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "text/plain" -> ".txt";
            case "application/msword" -> ".doc";
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> ".docx";
            default -> "";
        };
    }
}
