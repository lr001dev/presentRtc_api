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
let worker
let https
let io
let mediasoupRouter


//Define Controllers
const connectionsController = require(`./controllers/connections.js`)


//Cors Policy
/////////////
// const whiteList = ['http://localhost:3001' ]
// const corsOptions = {
//   origin: (origin, callback) => {
//     if (origin === undefined || whiteList.indexOf(origin) !== -1) {
//       callback(null, true)
//     } else {
//       callback(new Error("BLOCKED BY CORS POLICY"))
//     }
//   }
// }

//Handle Express Middleware and Controllers
const runExpressApp = async () => {

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
  app.use(express.json())
  app.use(express.static(__dirname))
  // app.use(cors(corsOptions))
  // app.use((req, res, next) => {
  //   req.io = io
  //   next()
  // })

  app.use('/connections', connectionsController)
}

//Create Https(Secured) Server
const runHttpsServer =  async () => {
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

//Create SocketIo Server
const runSocketServer = async () => {

  //Bind Socket IO To HTTPS Server
  io = socketIO(https, {
    serveClient: false,
    path: `/server`,
    log: false,
  })

  //Export To SocketIO Controller
  module.exports.io = io
}

//Create Media Worker(1 Worker Per CPU Core) To Host Routers(ex. Conference Rooms)
const runMediasoupWorker = async () => {
  worker = await mediasoup.createWorker({
    logLevel: config.mediasoup.worker.logLevel,
    logTags: config.mediasoup.worker.logTags,
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
  })

  worker.on(`died`, () => {
    console.error(`mediasoup worker died, exiting in 2 seconds... [pid:%d]`, worker.pid)
    setTimeout(() => process.exit(1), 2000)
  })

  const mediaCodecs = config.mediasoup.router.mediaCodecs
  mediasoupRouter = await worker.createRouter({ mediaCodecs })
}

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
