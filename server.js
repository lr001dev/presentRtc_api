//Enviromental Variables
require(`dotenv`).config()
//Express Setup
const express = require(`express`)
const app = express()

//MediaSoup Configuration
const mediasoup = require(`mediasoup`)
const config = require(`./config`)
//File system
const fs = require(`fs`)
//Express Secured Server
const server = require(`https`)
//Socket IO
const socketIO = require(`socket.io`)
const cors = require('cors')
const bodyParser = require('body-parser')
//Configuration
const PORT = process.env.PORT || 3002

//Global Variables
let https
let worker;
let socketServer;
let producer;
let consumer;
let producerTransport;
let consumerTransport;
let mediasoupRouter;
//Define Controllers
// const connectionsController = require(`./controllers/socketConnections.js`)


//Time to launch Node Server, Socket Listeners and Mediasoup
( async () => {
  try {
    await runExpressApp()
    await runHttpsServer()
    await runSocketServer()
    await runMediasoupWorker()
  } catch (err) {
    console.error(err)
  }
})()

//Handle Express Middleware and Controllers
async function runExpressApp() {
  //Cors Policy
  ///////////
  const whiteList = ['https://localhost:3000' ]
  const corsOptions = {
    origin: (origin, callback) => {
      if (origin === undefined || whiteList.indexOf(origin) !== -1) {
        callback(null, true)
      } else {
        callback(new Error("BLOCKED BY CORS POLICY"))
      }
    },
  credentials: true,
  }

  app.use((error, req, res, next) => {
    if (error) {
      console.warn(`Express app error,`, error.message)
      error.status = error.status || (error.name === `TypeError` ? 400 : 500)
      res.statusMessage = error.message
      res.status(error.status).send(String(error))
    } else {
      next()
    }
  })
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: false }))
  // app.use(express.json())
  app.use(express.static(__dirname))
  app.use(cors(corsOptions))
  // app.use('/connect', connectionsController)
}

//Create Https(Secured) Server
async function runHttpsServer()  {
  const { sslKey, sslCrt } = config

  if (!fs.existsSync(sslKey) || !fs.existsSync(sslCrt)) {
    console.error(`SSL files are not found. check your config.js file`)
    process.exit(0)
  }

  const tls = {
    cert: fs.readFileSync(sslCrt),
    key: fs.readFileSync(sslKey),
  }

  https = server.createServer(tls, app)

  https.on(`error`, (err) => {
    console.error(`starting web server failed:`, err.message)
  })

  await new Promise((resolve) => {
    const { listenIp, listenPort } = config

    https.listen(PORT , listenIp, () => {

      const listenIps = config.mediasoup.webRtcTransport.listenIps[0]
      const ip = listenIps.announcedIp || listenIps.ip

      console.log(`I'm listening to port ${ PORT }`)
      console.log(`server is running`)
      console.log(`open https://${ ip }:${ PORT } in your web browser`)

      resolve()
    })
  })
}

async function runSocketServer() {
  // socketServer = socketIO(https, {
  //   serveClient: false,
  //   path: '/server',
  //   log: false,
  // });

  socketServer = socketIO(https)

  socketServer.on('connection', (socket) => {
    console.log('client connected');

    // inform the client about existence of producer
    if (producer) {
      socket.emit('newProducer');
    }

    socket.on('disconnect', () => {
      console.log('client disconnected');
    });

    socket.on('connect_error', (err) => {
      console.error('client connection error', err);
    });

    //Socket Joining Chat Room
  socket.on(`room`, (roomId, sockId) => {
    socket.join(roomId._id)

    //Lets create an array of active client list to send to front end
    socketServer.of('/').in(roomId._id).clients((error,peers) => {

      let activePeers = []
      peers.map((peer, index) => {
        let newPeer = {
          peerId: peer,
          peerIndex: index
        }
        activePeers.push(newPeer)
        console.log(`activePeers`)
        console.log(activePeers)
      })
      //Sending to front end
      socketServer.to(roomId._id).emit(`currentPeers`, `just entered the room`, roomId, activePeers)
    })
  })
    socket.on('getRouterRtpCapabilities', (data, callback) => {
      callback(mediasoupRouter.rtpCapabilities);
    });

    socket.on('createProducerTransport', async (data, callback) => {
      try {
        const { transport, params } = await createWebRtcTransport();
        producerTransport = transport;
        callback(params);
      } catch (err) {
        console.error(err);
        callback({ error: err.message });
      }
    });

    socket.on('createConsumerTransport', async (data, callback) => {
      try {
        const { transport, params } = await createWebRtcTransport();
        consumerTransport = transport;
        callback(params);
      } catch (err) {
        console.error(err);
        callback({ error: err.message });
      }
    });

    socket.on('connectProducerTransport', async (data, callback) => {
      await producerTransport.connect({ dtlsParameters: data.dtlsParameters });
      callback();
    });

    socket.on('connectConsumerTransport', async (data, callback) => {
      await consumerTransport.connect({ dtlsParameters: data.dtlsParameters });
      callback();
    });

    socket.on('produce', async (data, callback) => {
      const {kind, rtpParameters} = data;
      producer = await producerTransport.produce({ kind, rtpParameters });
      callback({ id: producer.id });

      // inform clients about new producer
      socket.broadcast.emit('newProducer');
    });

    socket.on('consume', async (data, callback) => {
      callback(await createConsumer(producer, data.rtpCapabilities));
    });

    socket.on('resume', async (data, callback) => {
      await consumer.resume();
      callback();
    });
  });
}

async function runMediasoupWorker() {
  worker = await mediasoup.createWorker({
    logLevel: config.mediasoup.worker.logLevel,
    logTags: config.mediasoup.worker.logTags,
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
  });

  worker.on('died', () => {
    console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
    setTimeout(() => process.exit(1), 2000);
  });

  const mediaCodecs = config.mediasoup.router.mediaCodecs;
  mediasoupRouter = await worker.createRouter({ mediaCodecs });
}

async function createWebRtcTransport() {
  const {
    maxIncomingBitrate,
    initialAvailableOutgoingBitrate
  } = config.mediasoup.webRtcTransport;

  const transport = await mediasoupRouter.createWebRtcTransport({
    listenIps: config.mediasoup.webRtcTransport.listenIps,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate,
  });
  if (maxIncomingBitrate) {
    try {
      await transport.setMaxIncomingBitrate(maxIncomingBitrate);
    } catch (error) {
    }
  }
  return {
    transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    },
  };
}

async function createConsumer(producer, rtpCapabilities) {
  if (!mediasoupRouter.canConsume(
    {
      producerId: producer.id,
      rtpCapabilities,
    })
  ) {
    console.error('can not consume');
    return;
  }
  try {
    consumer = await consumerTransport.consume({
      producerId: producer.id,
      rtpCapabilities,
      paused: producer.kind === 'video',
    });
  } catch (error) {
    console.error('consume failed', error);
    return;
  }

  if (consumer.type === 'simulcast') {
    await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
  }

  return {
    producerId: producer.id,
    id: consumer.id,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
    type: consumer.type,
    producerPaused: consumer.producerPaused
  };
}

// //Create SocketIo Server
// async function runSocketServer() {
//   require(`./controllers/socketSoupSingaling`)(https)
// }
//
// //Create Media Worker(1 Worker Per CPU Core) To Host Routers(ex. Conference Rooms)
// async function runMediasoupWorker() {
//   require(`./controllers/MediaWorker`)
// }
//
// require(`./controllers/Transport`)
