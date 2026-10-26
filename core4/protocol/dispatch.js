'use strict';
const { hash, canonical, exact, fail } = require('./json');
const FIELDS = ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash', 'phase'];
function dispatchBinding(command, receiverStoreIdentity) {
  if (typeof receiverStoreIdentity !== 'string' || !receiverStoreIdentity) fail('receiver_store_identity_required');
  const origin = Object.fromEntries(FIELDS.map(k => [k, command[k]]));
  return { ...origin, receiverStoreIdentity, receiptRef: hash({ ...origin, receiverStoreIdentity }) };
}
function sameDispatch(actual, expected) {
  if (!actual || !expected) return false;
  exact(actual, [...FIELDS, 'receiverStoreIdentity', 'receiptRef']);
  return canonical(actual) === canonical(expected) && actual.receiptRef === dispatchBinding(actual, actual.receiverStoreIdentity).receiptRef;
}
module.exports = { dispatchBinding, sameDispatch };
