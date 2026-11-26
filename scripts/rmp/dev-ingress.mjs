// Loaded only by scripts/dev.mjs. Sign the actual socket before Next sees any
// request, and replace all client-supplied versions of our private proof header.
import { Server } from "node:http";
import {
  INGRESS_HEADER,
  signIngressProof,
  readSignedIngressProof,
} from "./dev-ingress-proof.mjs";
const original = Server.prototype.emit;
if (process.env.RMP_DEV_INGRESS_SECRET?.length >= 64) {
  Server.prototype.emit = function (event, ...args) {
    if (event === "request") {
      const request = args[0];
      const previous = request.headers[INGRESS_HEADER];
      delete request.headers[INGRESS_HEADER];
      for (let index = request.rawHeaders.length - 2; index >= 0; index -= 2) {
        if (request.rawHeaders[index].toLowerCase() === INGRESS_HEADER)
          request.rawHeaders.splice(index, 2);
      }
      // Next can proxy an external request to a localhost render worker. Keep
      // a valid signed original peer (including denied/expired peers) rather
      // than upgrading that request to the worker's loopback connection.
      request.headers[INGRESS_HEADER] =
        typeof previous === "string" &&
        readSignedIngressProof(previous, process.env.RMP_DEV_INGRESS_SECRET)
          ? previous
          : signIngressProof(
              request.socket.remoteAddress,
              request.method,
              request.url,
              process.env.RMP_DEV_INGRESS_SECRET,
            );
      request.rawHeaders.push(INGRESS_HEADER, request.headers[INGRESS_HEADER]);
    }
    return original.call(this, event, ...args);
  };
}
