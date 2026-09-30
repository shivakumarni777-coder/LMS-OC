package com.bank.lms.service.storage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;

/**
 * Where uploaded document bytes are kept.
 *
 * <p>{@code loan_document.storage_key} is the only pointer to a file, and this
 * interface is everything the rest of the system knows about it. Swapping the
 * backing store - a local directory today, a mounted Azure file share later - is
 * then a configuration change rather than a schema migration or a change to any
 * calling code.
 *
 * <p>Keys are opaque to callers and are always <em>generated</em> by
 * {@link #store}, never supplied by a client. That is deliberate: a key that
 * reached this layer from a request body could contain {@code ../} and escape
 * the storage root. Keeping generation inside the implementation means there is
 * no code path by which a caller-chosen string becomes a path.
 */
public interface DocumentStorage {

    /**
     * Writes the content and returns the key it can later be read back with.
     *
     * <p>The key is chosen by the implementation. There is deliberately no
     * overload that accepts one, because the moment a key can be passed in from
     * a request body it can contain {@code ../} and escape the storage root.
     *
     * <p>The caller has already closed {@code content} by the time this returns.
     *
     * @param relativeDirectory where under the root the document belongs, e.g.
     *                          {@code loans/12} - names the application, not the file
     * @throws IOException if the bytes could not be written
     */
    String store(Path relativeDirectory, String contentType, InputStream content) throws IOException;

    /**
     * Opens the stored bytes for reading. The caller closes the stream.
     *
     * @throws IOException if the key is not in this store, or could not be read
     */
    InputStream read(String key) throws IOException;

    /**
     * Removes the bytes. A key that is already gone is not an error, so this is
     * safe to call while rolling back a failed upload.
     */
    void delete(String key) throws IOException;

    /** Whether the key resolves to something readable in this store. */
    boolean exists(String key);
}
