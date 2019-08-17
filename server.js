
//Enviromental Variables
require(`dotenv`).config()

//Express Setup
const express = require(`express`)
const app = express()
const socketIO = require('socket.io')

//We are creating sever instance manually for socketio integration
const http = require(`http`).createServer(app)

//MediaSoup Configuration
const mediasoup = require("mediasoup")

//Configuration
const PORT = process.env.PORT || 3002

http.listen(PORT, () => {
  console.log(`I'm listening to port ${ PORT }`)
})
