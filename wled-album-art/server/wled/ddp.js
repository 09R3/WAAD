const dgram = require('dgram');
const { loadSettings, emitter: configEmitter } = require('../config/store');

// DDP header: 10 bytes
// Byte 0: 0x41 (flags: version=1, push=1)
// Byte 1: 0x44 ('D')
// Bytes 2-3: sequence (1 byte) + flags
// Actually per DDP spec:
//   [0] flags: 0x41 = version=1, push=true
//   [1] flags2/sequence (we use 0x00)
//   [2] type = 0x01 (RGB)
//   [3] source ID = 0x01
//   [4-7] offset (big-endian 32-bit)
//   [8-9] length (big-endian 16-bit)

let lastPushAt = null;
let lastError = null;

function buildDDPPacket(pixelData, offset = 0) {
  const dataLen = pixelData.length;
  const header = Buffer.alloc(10);

  header[0] = 0x41; // flags: version=1, push=1
  header[1] = 0x00; // sequence
  header[2] = 0x01; // type: RGB
  header[3] = 0x01; // source ID

  // offset (4 bytes big-endian)
  header.writeUInt32BE(offset, 4);

  // length (2 bytes big-endian)
  header.writeUInt16BE(dataLen, 8);

  return Buffer.concat([header, Buffer.from(pixelData)]);
}

function pushPixels(pixelData, ip, port) {
  return new Promise((resolve, reject) => {
    const settings = loadSettings();
    const targetIp = ip || settings.wled?.ip;
    const targetPort = port || settings.wled?.port || 4048;

    if (!targetIp) {
      const err = new Error('No WLED IP configured');
      lastError = err.message;
      return reject(err);
    }

    const packet = buildDDPPacket(pixelData);
    const socket = dgram.createSocket('udp4');

    socket.send(packet, 0, packet.length, targetPort, targetIp, (err) => {
      socket.close();
      if (err) {
        lastError = err.message;
        reject(err);
      } else {
        lastPushAt = Date.now();
        lastError = null;
        resolve();
      }
    });

    socket.on('error', (err) => {
      lastError = err.message;
      try { socket.close(); } catch (_) {}
      reject(err);
    });
  });
}

function getStatus() {
  return {
    lastPushAt,
    lastError,
  };
}

module.exports = { pushPixels, buildDDPPacket, getStatus };
