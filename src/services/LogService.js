class ElkLoggerStub {
  async log(_payload) {
    // v1: no-op (future ELK)
  }
}

class LogService {
  constructor(supabase) {
    this.supabase = supabase;
    this.elkLogger = new ElkLoggerStub();
  }

  /**
   * Never throw — failures go to console only (P1-13).
   * @param {object} params
   */
  async log({
    event_type,
    entity_type,
    entity_id = null,
    actor_id = null,
    actor_role = null,
    before_state = null,
    after_state = null,
    metadata = {},
  }) {
    try {
      const { error } = await this.supabase.from('system_logs').insert({
        event_type,
        entity_type,
        entity_id,
        actor_id,
        actor_role,
        before_state,
        after_state,
        metadata,
      });
      if (error) {
        console.error('[LogService] Supabase insert failed:', error.message);
      }
    } catch (e) {
      console.error('[LogService] Unexpected error:', e.message);
    }
    try {
      await this.elkLogger.log({
        event_type,
        entity_type,
        entity_id,
        actor_id,
        actor_role,
        before_state,
        after_state,
        metadata,
      });
    } catch (e) {
      console.error('[LogService] ELK stub failed:', e.message);
    }
  }
}

module.exports = { LogService };
