# 14-representative-module

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/modules/titles-current-target/artifact.json:1–11`
Полный файл SHA256 (hex groups, concatenate) `daea352b:270666fa:b332739c:34d413e7:d2fdc021:db026bc3:5a5cf939:2552c9cc`; Git blob `e184e5d6:c1e5ed53:e2846d24:ddc9e759:f8a512c7`. Выдержка: строки 1–11, 406 bytes.

```json
{
  "id": "titles-current-target",
  "version": "4.0.0",
  "entry": "implementation.js",
  "hashes": {
    "implementation.js": "1b31cd96b475f6af3e286fdd5c009d46e09b18b271db88ce951e9ec8d7fc580b",
    "contract.json": "318a5d6021bc94690323ab00ca324c694c6b66dd520a28989eda87643c1d3ce0",
    "executor.jsx": "f439be6df6abb5a3de9372c85c91e895a05283e8d15d53784d9e7ba808701eb4"
  },
  "publicDependencies": {}
}
```

## `core4/modules/titles-current-target/contract.json:160–182`
Полный файл SHA256 (hex groups, concatenate) `318a5d60:21bc9469:0323ab00:ca324c69:4c6b66dd:520a2898:9eda8764:3c1d3ce0`; Git blob `d5f6e035:e8eb45e4:2fa397c2:1e4ccff4:14ab1fac`. Выдержка: строки 160–182, 530 bytes.

```json
  "effectPolicy": {
    "effect": "layer.text",
    "targetFields": [
      "projectId",
      "compId",
      "layerId"
    ],
    "expectedBindings": {
      "expectedRevision": "revision",
      "expectedText": "text"
    },
    "resultBindings": {
      "text": "text"
    },
    "preserve": [
      "protected"
    ],
    "requiresCheckpoint": true,
    "confirmation": "native-current-target",
    "checkpointKind": "manual-text-preimage-v1"
  },
  "executionPolicy": "current-matching-target-after-local-confirmation-v1"
}
```

## `core4/modules/titles-current-target/implementation.js:1–6`
Полный файл SHA256 (hex groups, concatenate) `1b31cd96:b475f6af:3e286fdd:5c009d46:e09b18b2:71db88ce:951e9ec8:d7fc580b`; Git blob `ef0a4406:d27ba30d:b61faf34:c13d8cbe:9de19401`. Выдержка: строки 1–6, 372 bytes.

```javascript
'use strict';
function build({ input, evidence }) {
  if (/[\r\n]/.test(input.text) || input.text.length === 0) { const e = new Error('single-line nonempty title required'); e.code = 'unsupported'; throw e; }
  return { operationId: 'set-current-text', input: { ...input, expectedRevision: evidence.revision, expectedText: evidence.text } };
}
module.exports = { build };
```

## `core4/modules/titles-current-target/executor.jsx:70–106`
Полный файл SHA256 (hex groups, concatenate) `f439be6d:f6abb5a3:de9372c8:5c91e895:a05283e8:d15d5378:4d9e7ba8:08701eb4`; Git blob `aeca73c4:bd4a3c9c:a04083a9:bea6802f:1daca4ef`. Выдержка: строки 70–106, 3982 bytes.

```javascript
        for (i = 0; i < text.length; i++) if (serialized(fields(range(doc, i), characterFields)) !== serialized(uniform)) fault('unsupported_mixed_style');
        var style = { character: uniform, paragraph: fields(doc, paragraphFields) };
        var resource = { projectId: p.projectId, compId: t.comp.id, layerId: t.layer.id };
        return { target: resource, text: text, 'protected': serialized(style), revision: serialized([resource, text, style]) };
    }
    function readSnapshot(p) {
        try { return snapshot(p); }
        catch (e) { var code = 'inspection_failed'; try { if (e && readCode(e.coreReadCode)) code = e.coreReadCode; else if (e && readCode(e.coreCode)) code = e.coreCode; } catch (ignored) {} return { readFailureVersion: 1, outcome: 'rejected', code: code }; }
    }
    function mutate(p) {
        var started = false;
        try {
            var before = snapshot(p);
            if (p.expectedRevision !== before.revision || p.expectedText !== before.text) fault('stale_target');
            if (typeof p.text !== 'string' || p.text.length === 0 || /[\r\n]/.test(p.text)) fault('unsupported_text');
            var proof = p._execution;
            if (!proof || proof.policyId !== 'current-matching-target-after-local-confirmation-v1' || proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] || !proof.target || proof.target.projectId !== before.target.projectId || proof.target.compId !== before.target.compId || proof.target.layerId !== before.target.layerId) fault('manual_approval_binding');
            var message = 'Изменить текст в текущей совпадающей цели?\nПодтверждение относится к текущему проекту, в том числе после повторного открытия.\nПроект: ' + p.projectId + '\ncompId: ' + p.compId + '\nlayerId: ' + p.layerId + '\nСтарый текст: ' + JSON.stringify(before.text) + '\nНовый текст: ' + JSON.stringify(p.text);
            var operator = proof.operatorConfirmation;
            if (operator) {
                if (!/^[a-f0-9]{64}$/.test(operator.digest) || typeof operator.expiresAt !== 'number' || operator.expiresAt <= new Date().getTime()) fault('operator_confirmation_expired');
            } else if (confirm(message, true, 'AE Agent Core4 — изменение текста') !== true) return { outcome: 'rejected', code: 'local_cancelled' };
            // Fresh resolution/CAS after modal boundary, then one synchronous setter
            // and separate local snapshot; no scheduling/modal/Node yield follows.
            before = snapshot(p);
            if (p.expectedRevision !== before.revision || p.expectedText !== before.text || proof.baselineProtected !== before['protected']) fault('stale_target');
            var t = target(p), doc = t.prop.value; doc.text = p.text;
            started = true; t.prop.setValue(doc);
            var after = snapshot(p);
            if (after.text !== p.text || after['protected'] !== before['protected']) fault('readback_mismatch');
            var verified = snapshot(p);
            if (verified.text !== p.text || verified['protected'] !== before['protected']) fault('local_transaction_readback');
            return { outcome: 'applied', snapshot: verified, transactionReceipt: { version: 1, policyId: proof.policyId, proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch, stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest, baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: verified.target, desiredText: p.text, protectedFields: verified['protected'] } };
        } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'ae_error' }; }
    }
    return { inspect: readSnapshot, mutate: mutate, verify: readSnapshot };
}())
```

## `core4/config/admissions/titles-current-target.json:1–4`
Полный файл SHA256 (hex groups, concatenate) `c6adbebb:9ad8b919:e91c0de2:c773e933:9be9922a:8ddac50b:55d51515:0c4dd68c`; Git blob `3ecf17aa:7cc0aa1a:042d8cfb:fcd5033c:1ca0c5f0`. Выдержка: строки 1–4, 164 bytes.

```json
{
  "moduleId": "titles-current-target",
  "operationId": "set-current-text",
  "artifactHash": "704e67f0793eb9ebcf7fafc41e0d777ed6d3cd4d801d9f847da08eefb892e284",
```

## `core4/config/admissions/titles-current-target.json:6–12`
Полный файл SHA256 (hex groups, concatenate) `c6adbebb:9ad8b919:e91c0de2:c773e933:9be9922a:8ddac50b:55d51515:0c4dd68c`; Git blob `3ecf17aa:7cc0aa1a:042d8cfb:fcd5033c:1ca0c5f0`. Выдержка: строки 6–12, 383 bytes.

```json
  "resultSchemaHash": "4bc17d85c2f755387cbff3dacc49936549a94f002bdb3ed7a18d34919e9edd7b",
  "effectPolicyHash": "2dce26553f76310412f1e4e4e53a487b23d0da68bdf6abf1edd22ccc0bbd3d2f",
  "executorHash": "f439be6df6abb5a3de9372c85c91e895a05283e8d15d53784d9e7ba808701eb4",
  "protocolVersion": 1,
  "trustApprovalId": "M1-source-review-titles-current-target-20261026",
  "revoked": false
}
```
