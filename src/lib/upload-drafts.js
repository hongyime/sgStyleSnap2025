// Temporary recovery copies. Only a verified publication receipt permits file
// compaction; acknowledged copies can then be pruned because Supabase retains
// the complete bytes, original metadata, source versions and durable receipt.
export function createUploadDraftStore(indexedDB = globalThis.indexedDB) {
  let opening
  async function open() {
    if (!indexedDB) throw new Error('Draft recovery storage is unavailable in this browser.')
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const request = indexedDB.open('stylesnap-private-uploads', 1)
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore('drafts', { keyPath: 'id' })
          store.createIndex('active_key', 'active_key', { unique: true })
          store.createIndex('owner', 'owner')
        }
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error('Close older StyleSnap tabs before retrying this upload.'))
        request.onsuccess = () => {
          request.result.onversionchange = () => { request.result.close(); opening = undefined }
          resolve(request.result)
        }
      }).catch(error => { opening = undefined; throw error })
    }
    return opening
  }
  async function transaction(mode, action) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode), store = tx.objectStore('drafts')
      let result, failure
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(failure || tx.error || new Error('Could not keep a recovery copy of this upload.'))
      tx.onerror = () => {}
      try { action(store, value => { result = value }, error => { failure = error; tx.abort() }) }
      catch (error) { failure = error; tx.abort() }
    })
  }
  return {
    prepare(record) {
      return transaction('readwrite', (store, done, fail) => {
        const lookup = store.index('active_key').get(record.active_key)
        lookup.onsuccess = () => {
          if (lookup.result) { done(lookup.result); return }
          const owners = store.index('owner').getAll(record.owner)
          owners.onsuccess = () => {
            const existing = owners.result
            if (existing.filter(row => row.state !== 'acknowledged').length >= 5) {
              fail(new Error('Finish the saved uploads below before starting another.')); return
            }
            // Prune only locally acknowledged receipts, never unfinished files.
            const acknowledged = existing.filter(row => row.state === 'acknowledged').sort((a,b) => b.created_at-a.created_at)
            for (const old of acknowledged.slice(49)) store.delete(old.id)
            store.add(record)
            done(record)
          }
        }
      })
    },
    get(id, owner) {
      return transaction('readonly', (store, done) => {
        const request = store.get(id)
        request.onsuccess = () => done(request.result?.owner === owner ? request.result : undefined)
      })
    },
    list(owner) {
      return transaction('readonly', (store, done) => {
        const request = store.index('owner').getAll(owner)
        request.onsuccess = () => done(request.result.filter(row => row.state !== 'acknowledged'))
      })
    },
    complete(id, owner, receipt) {
      return transaction('readwrite', (store, done, fail) => {
        const request = store.get(id)
        request.onsuccess = () => {
          const record = request.result
          if (!record || record.owner !== owner || receipt.request_id !== id || receipt.item?.owner_id !== owner) {
            fail(new Error('The upload receipt did not match this draft.')); return
          }
          record.state = 'complete'
          record.receipt = receipt
          delete record.files
          store.put(record)
          done(record)
        }
      })
    },
    acknowledge(id, owner) {
      return transaction('readwrite', (store, done) => {
        const request = store.get(id)
        request.onsuccess = () => {
          const record = request.result
          if (record?.owner === owner && record.state === 'complete') {
            store.put({ id, owner, state: 'acknowledged', created_at: record.created_at })
          }
          done()
        }
      })
    },
  }
}
