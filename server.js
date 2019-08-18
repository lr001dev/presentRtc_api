//Enviromental Variables
require(`dotenv`).config()
//Express Setup
const express = require(`express`)
//Socket IO
const socketIO = require('socket.io')
//MediaSoup Configuration
const mediasoup = require("mediasoup")
const config = require('./config')
//File system
const fs = require('fs')
//Express Secured Server
const https = require('https')

//Configuration
const PORT = process.env.PORT || 3002

//Global Variables
let worker
let webServer
let socketServer
let expressApp
let producer
let consumer
let producerTransport
let consumerTransport
let mediasoupRouter

//Run Express
const runExpressApp = async () => {
  expressApp = express()
  expressApp.use(express.json())
  expressApp.use(express.static(__dirname))

  expressApp.use((error, req, res, next) => {
    if (error) {
      console.warn('Express app error,', error.message)
      error.status = error.status || (error.name === 'TypeError' ? 400 : 500)
      res.statusMessage = error.message
      res.status(error.status).send(String(error))
    } else {
      next()
    }
  })
}
//Start Server
const runWebServer =  async () => {
  const { sslKey, sslCrt } = config

  if (!fs.existsSync(sslKey) || !fs.existsSync(sslCrt)) {
    console.error('SSL files are not found. check your config.js file')
    process.exit(0)
  }

  const tls = {
    cert: fs.readFileSync(sslCrt),
    key: fs.readFileSync(sslKey),
  }

  webServer = https.createServer(tls, expressApp)

  webServer.on('error', (err) => {
    console.error('starting web server failed:', err.message)
  })

  await new Promise((resolve) => {
    const { listenIp, listenPort } = config

    webServer.listen(PORT , listenIp, () => {

      const listenIps = config.mediasoup.webRtcTransport.listenIps[0]
      const ip = listenIps.announcedIp || listenIps.ip

      console.log(`I'm listening to port ${ PORT }`)
      console.log('server is running')
      console.log(`open https//${ ip }:${ PORT } in your web browser`)

      resolve()
    })
  })
}

( async () => {
  try {
    await runExpressApp()
    await runWebServer()

  } catch (err) {
    console.error(err)
  }
})()
