const express = require('express')
const router = express.Router()
const server = require(`../server.js`)

let producer
let consumer
let producerTransport
let consumerTransport

router.get(`/`, (req, res) => {

  server.io.on(`connected`, (socket) => {
    console.log(`conneted`)
  })
  res.send(`hello`)
})

module.exports = router
