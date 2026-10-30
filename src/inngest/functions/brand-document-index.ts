import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { indexDocument } from '@/services/brand-brain/documents'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * PDF o brendu (D-112): tekst, odlomci i embeddingi u bazu znanja. Jedan dokument po brendu u isto
 * vreme; posle iscrpljenih pokušaja dokument ostaje „failed” sa porukom, umesto večnog „processing”.
 */
export const brandDocumentIndex = inngest.createFunction(
  {
    id: 'brand-document-index',
    retries: 2,
    concurrency: [{ key: 'event.data.brandId', limit: 1 }],
    triggers: [events.brandDocumentUploaded],
    onFailure: async ({ event }) => {
      const documentId = event.data.event.data.documentId
      await createSupabaseAdminClient()
        .from('brand_documents')
        .update({ status: 'failed', error: 'Dokument nije pročitan. Obrišite ga i pokušajte ponovo.' })
        .eq('id', documentId)
        .eq('status', 'processing')
    },
  },
  async ({ event, step }) => step.run('index', () => indexDocument(event.data.documentId)),
)
