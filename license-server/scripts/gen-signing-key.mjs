// Erzeugt das Schluesselpaar fuer die Lizenz-Tickets.
//  PRIVAT  -> als Secret SIGNING_KEY im Worker (wrangler secret put SIGNING_KEY)
//  OEFFENTLICH -> in app/config.js bei license.publicKey
import { generateKeyPairSync } from 'node:crypto';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
console.log('PRIVAT (SIGNING_KEY, geheim halten!):');
console.log(privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'));
console.log('\nOEFFENTLICH (app/config.js -> license.publicKey):');
console.log(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
