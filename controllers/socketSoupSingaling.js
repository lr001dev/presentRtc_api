const mediaWorker = require('./MediaWorker')

module.exports = (https) => {
  const io = require(`socket.io`)(https)
  let producer
  let consumer
  let producerTransport
  let consumerTransport

  io.on(`connection`,(socket) => {
    console.log(`connected`)

    // inform the client about existence of producer
    if (producer) {
      socket.emit('newProducer')
    }

    socket.on('disconnect', () => {
      console.log('client disconnected')
    })

    socket.on('connect_error', (err) => {
      console.error('client connection error', err)
    })

    socket.on('getRouterRtpCapabilities', (data, callback) => {
      callback(mediaWorker.mediasoupRouter.rtpCapabilities)
    })

    socket.on('createProducerTransport', async (data, callback) => {
      try {
            const { transport, params } = await createWebRtcTransport()
            producerTransport = transport
            callback(params)
         } catch (err) {
           console.error(err)
           callback({ error: err.message })
         }
    })

    socket.on('createConsumerTransport', async (data, callback) => {
      try {
           const { transport, params } = await createWebRtcTransport()
           consumerTransport = transport
           callback(params)
         } catch (err) {
            console.error(err)
            callback({ error: err.message })
         }
    })

    socket.on('connectProducerTransport', async (data, callback) => {
      await producerTransport.connect({ dtlsParameters: data.dtlsParameters })
        callback()
    })

    socket.on('connectConsumerTransport', async (data, callback) => {
      await consumerTransport.connect({ dtlsParameters: data.dtlsParameters })
        callback()
    })

    socket.on('produce', async (data, callback) => {
      const {kind, rtpParameters} = data;
      producer = await producerTransport.produce({ kind, rtpParameters })
      callback({ id: producer.id })

         // inform clients about new producer
         socket.broadcast.emit('newProducer')
    })

    socket.on('consume', async (data, callback) => {
      callback(await createConsumer(producer, data.rtpCapabilities))
    })

    socket.on('resume', async (data, callback) => {
      await consumer.resume()
      callback()
    })
  })
}
