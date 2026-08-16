import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { __setNameMapForTests, isMoneyMovingVantageTool } from './vantageMcp.js';

// Vantage MCP tools were dispatched with no gate at all — the owner PIN only
// ever covered this app's own local tools — so a spoken sentence could place a
// real order or mint a wallet. These cover which tools now sit behind that gate.

function withTools(realNames: string[]) {
  const map = new Map<string, string>();
  for (const real of realNames) map.set(`vantage__${real}`, real);
  __setNameMapForTests(map);
}

describe('money-moving Vantage tools', () => {
  it('gates the tools that spend or sign', () => {
    withTools([
      'create_order_post',
      'execute_live_trade_post',
      'generate_wallet_post',
      'withdraw_funds_post',
      'swap_tokens_post',
      'cancel_order_post',
    ]);

    for (const name of [
      'vantage__create_order_post',
      'vantage__execute_live_trade_post',
      'vantage__generate_wallet_post',
      'vantage__withdraw_funds_post',
      'vantage__swap_tokens_post',
      'vantage__cancel_order_post',
    ]) {
      assert.equal(isMoneyMovingVantageTool(name), true, name);
    }
  });

  it('does not gate reads, so the gate stays meaningful', () => {
    // If looking something up demanded the PIN, people would unlock for
    // everything and the gate would protect nothing.
    withTools([
      'list_orders_get',
      'get_wallet_get',
      'read_trade_journal_get',
      'search_markets_get',
      'status_of_trading_get',
      'fetch_order_get',
    ]);

    for (const name of [
      'vantage__list_orders_get',
      'vantage__get_wallet_get',
      'vantage__read_trade_journal_get',
      'vantage__search_markets_get',
      'vantage__status_of_trading_get',
      'vantage__fetch_order_get',
    ]) {
      assert.equal(isMoneyMovingVantageTool(name), false, name);
    }
  });

  it('leaves unrelated tools alone', () => {
    withTools(['create_broadcast_post', 'vault_note_post', 'whoami_get']);

    assert.equal(isMoneyMovingVantageTool('vantage__create_broadcast_post'), false);
    assert.equal(isMoneyMovingVantageTool('vantage__vault_note_post'), false);
    assert.equal(isMoneyMovingVantageTool('vantage__whoami_get'), false);
  });

  it('returns false for a tool it has never seen', () => {
    withTools([]);
    assert.equal(isMoneyMovingVantageTool('vantage__anything'), false);
  });
});
