async function mediaWorker (worker,mediasoupRouter) {
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

module.exports.mediaWorker = mediaWorker
