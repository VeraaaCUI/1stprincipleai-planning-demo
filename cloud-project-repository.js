/* Supabase transport for the existing Project v1 model.
 * Ownership is enforced by PostgreSQL RLS, not these defensive UI filters.
 */
(function (scope) {
  'use strict';
  const TABLE = 'planning_projects';
  const COLUMNS = 'id,owner_id,project_data,source_local_id,created_at,updated_at,revision';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const READ_ONLY = ['id', 'schemaVersion', 'createdAt', 'updatedAt', 'syncStatus'];
  function problem(message, code) { const error = new Error(message); error.code = code; return error; }
  function createRepository({client, auth} = {}) {
    const storage = scope.FirstPrincipleProjectStorage;
    if (!storage?.prepareProject || !storage?.sanitizeProject) throw problem('Project validation is unavailable. Refresh the page.', 'cloud_configuration');
    const rows = new Map(); let epoch = 0, principal = auth?.getState?.()?.user?.id || null;
    const unsubscribe = auth?.subscribe?.(state => {
      const next = state?.status === 'authenticated' ? state.user?.id : null;
      if (next !== principal) { principal = next; epoch++; rows.clear(); }
    });
    function actor() {
      const state = auth?.getState?.();
      if (!client?.from) throw problem('Account project storage is not configured.', 'cloud_configuration');
      if (state?.status !== 'authenticated' || !state.user?.id) throw problem('Log in to use account projects.', 'authentication_required');
      return {id: state.user.id, epoch};
    }
    function unchanged(captured) {
      const state = auth?.getState?.();
      if (captured.epoch !== epoch || state?.status !== 'authenticated' || state.user?.id !== captured.id)
        throw problem('Your account changed during this action. Refresh My Projects before trying again.', 'cloud_session_changed');
    }
    function failure(error) {
      if (['PGRST205', '42P01'].includes(error?.code)) return problem('Account project storage has not been set up yet. The Supabase database migration is required. Your enquiry remains temporary.', 'cloud_setup_required');
      if (['42501', 'PGRST301', 'PGRST302'].includes(error?.code) || error?.status === 401 || error?.status === 403)
        return problem('This account cannot access that project. Log in again or refresh My Projects.', 'cloud_access_denied');
      return problem('The account project request failed. Check your connection and retry. Your enquiry remains temporary.', 'cloud_request_failed');
    }
    async function request(query, captured) {
      unchanged(captured); let result;
      try { result = await query; } catch (_) { unchanged(captured); throw failure(); }
      unchanged(captured);
      if (result?.error) throw failure(result.error);
      return result;
    }
    function projectId(id) { if (typeof id !== 'string' || !UUID.test(id)) throw problem('Choose a valid project.', 'invalid_project'); return id; }
    function consume(row, captured) {
      unchanged(captured);
      if (!row || row.owner_id !== captured.id) throw problem('The account project response could not be verified.', 'cloud_invalid_response');
      projectId(row.id);
      if (!Number.isSafeInteger(row.revision) || row.revision < 1) throw problem('The project version is invalid.', 'cloud_invalid_response');
      const project = storage.sanitizeProject({...row.project_data, id: row.id,
        createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString()});
      rows.set(project.id, {project, ownerId: captured.id, revision: row.revision,
        createdAt: project.createdAt, updatedAt: project.updatedAt, sourceLocalId: row.source_local_id || null});
      return project;
    }
    async function findRequest(captured, requestId) {
      const result = await request(client.from(TABLE).select(COLUMNS).eq('owner_id', captured.id).eq('source_local_id', requestId).maybeSingle(), captured);
      return result.data ? consume(result.data, captured) : null;
    }
    async function createProject(input = {}, {requestId} = {}) {
      const captured = actor(), project = storage.prepareProject(input);
      if (requestId !== undefined) {
        projectId(requestId);
        const existing = await findRequest(captured, requestId);
        if (existing) return existing;
      }
      const payload = {project_data: project, owner_id: captured.id};
      // Reuse the existing per-owner uniqueness constraint to make retries idempotent.
      if (requestId) payload.source_local_id = requestId;
      unchanged(captured); let result;
      try { result = await client.from(TABLE).insert(payload).select(COLUMNS).single(); }
      catch (_) { unchanged(captured); throw failure(); }
      unchanged(captured);
      if (result?.error?.code === '23505' && requestId) {
        const existing = await findRequest(captured, requestId);
        if (existing) return existing;
      }
      if (result?.error) throw failure(result.error);
      return consume(result.data, captured);
    }
    async function getProject(id) {
      projectId(id); const captured = actor();
      const result = await request(client.from(TABLE).select(COLUMNS).eq('id', id).eq('owner_id', captured.id).maybeSingle(), captured);
      if (!result.data) { rows.delete(id); return null; }
      return consume(result.data, captured);
    }
    async function listProjects() {
      const captured = actor();
      const result = await request(client.from(TABLE).select(COLUMNS, {count: 'exact'}).eq('owner_id', captured.id)
        .order('updated_at', {ascending: false}).range(0, storage.limits.maxProjects - 1), captured);
      if (result.count > storage.limits.maxProjects) throw problem('This account exceeds the current 1,000-project browser limit. Contact support before exporting or managing the full collection.', 'cloud_collection_limit');
      if (!Array.isArray(result.data)) throw problem('The account project list could not be read.', 'cloud_invalid_response');
      rows.clear(); return result.data.map(row => consume(row, captured));
    }
    async function currentRow(id, captured) {
      projectId(id); unchanged(captured);
      if (!rows.has(id)) await getProject(id);
      unchanged(captured); const row = rows.get(id);
      if (!row || row.ownerId !== captured.id) throw problem('This project is unavailable. Refresh My Projects.', 'cloud_not_found');
      return row;
    }
    async function updateProject(id, patch) {
      const captured = actor(), row = await currentRow(id, captured);
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => READ_ONLY.includes(key)))
        throw problem('The project update contains a protected field.', 'invalid_project');
      const candidate = storage.sanitizeProject({...row.project, ...patch});
      const result = await request(client.from(TABLE).update({project_data: candidate})
        .eq('id', id).eq('owner_id', captured.id).eq('revision', row.revision).select(COLUMNS).maybeSingle(), captured);
      if (!result.data) { rows.delete(id); throw problem('This project changed or is no longer available. Refresh My Projects before saving again.', 'cloud_conflict'); }
      return consume(result.data, captured);
    }
    async function deleteProject(id) {
      const captured = actor(), row = await currentRow(id, captured);
      const result = await request(client.from(TABLE).delete().eq('id', id).eq('owner_id', captured.id)
        .eq('revision', row.revision).select('id').maybeSingle(), captured);
      if (!result.data) { rows.delete(id); throw problem('This project changed or is no longer available. Refresh My Projects before deleting it.', 'cloud_conflict'); }
      rows.delete(id); return true;
    }
    function getMetadata(id) {
      const row = rows.get(id), state = auth?.getState?.();
      return row && state?.status === 'authenticated' && state.user?.id === row.ownerId ?
        {scope: 'account', ownerId: row.ownerId, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt, sourceLocalId: row.sourceLocalId} : null;
    }
    return Object.freeze({createProject, getProject, listProjects, updateProject, deleteProject,
      getMetadata, dispose() { unsubscribe?.(); rows.clear(); epoch++; }});
  }
  const api = Object.freeze({createRepository, table: TABLE});
  scope.FirstPrincipleCloudProjectStorage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
