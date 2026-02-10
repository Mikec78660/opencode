const PI = Math.PI

export class FFT {
  private size: number
  private cosTable: Float32Array
  private sinTable: Float32Array
  private reverseTable: Uint32Array

  constructor(size: number) {
    if (size & (size - 1)) {
      throw new Error("FFT size must be a power of 2")
    }
    this.size = size
    this.cosTable = new Float32Array(size / 2)
    this.sinTable = new Float32Array(size / 2)
    this.reverseTable = new Uint32Array(size)

    for (let i = 0; i < size / 2; i++) {
      this.cosTable[i] = Math.cos((-2 * PI * i) / size)
      this.sinTable[i] = Math.sin((-2 * PI * i) / size)
    }

    let limit = 1
    let bit = size >> 1
    while (limit < size) {
      for (let i = 0; i < limit; i++) {
        this.reverseTable[i + limit] = this.reverseTable[i] + bit
      }
      limit <<= 1
      bit >>= 1
    }
  }

  forward(real: Float32Array, imag: Float32Array): void {
    const size = this.size
    const reverseTable = this.reverseTable
    const cosTable = this.cosTable
    const sinTable = this.sinTable

    for (let i = 0; i < size; i++) {
      const j = reverseTable[i]
      if (j > i) {
        let tmp = real[i]
        real[i] = real[j]
        real[j] = tmp
        tmp = imag[i]
        imag[i] = imag[j]
        imag[j] = tmp
      }
    }

    let halfSize = 1
    while (halfSize < size) {
      const step = size / (halfSize * 2)
      for (let i = 0; i < size; i += halfSize * 2) {
        let k = 0
        for (let j = i; j < i + halfSize; j++) {
          const cos = cosTable[k]
          const sin = sinTable[k]
          const realPart = real[j + halfSize] * cos - imag[j + halfSize] * sin
          const imagPart = real[j + halfSize] * sin + imag[j + halfSize] * cos
          real[j + halfSize] = real[j] - realPart
          imag[j + halfSize] = imag[j] - imagPart
          real[j] = real[j] + realPart
          imag[j] = imag[j] + imagPart
          k += step
        }
      }
      halfSize *= 2
    }
  }
}

export function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * PI * i) / (size - 1)))
  }
  return window
}

export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700)
}

export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1)
}

export function createMelFilterbank(
  numFilters: number,
  fftSize: number,
  sampleRate: number,
  lowFreq: number = 0,
  highFreq: number = sampleRate / 2,
): Float32Array[] {
  const melLow = hzToMel(lowFreq)
  const melHigh = hzToMel(highFreq)
  const melPoints = new Float32Array(numFilters + 2)

  for (let i = 0; i < numFilters + 2; i++) {
    melPoints[i] = melLow + ((melHigh - melLow) * i) / (numFilters + 1)
  }

  const hzPoints = new Float32Array(numFilters + 2)
  for (let i = 0; i < numFilters + 2; i++) {
    hzPoints[i] = melToHz(melPoints[i])
  }

  const binPoints = new Uint32Array(numFilters + 2)
  for (let i = 0; i < numFilters + 2; i++) {
    binPoints[i] = Math.floor(((fftSize + 1) * hzPoints[i]) / sampleRate)
  }

  const filterbank: Float32Array[] = []
  for (let i = 0; i < numFilters; i++) {
    const filter = new Float32Array(fftSize / 2 + 1)
    for (let j = binPoints[i]; j < binPoints[i + 1]; j++) {
      filter[j] = (j - binPoints[i]) / (binPoints[i + 1] - binPoints[i])
    }
    for (let j = binPoints[i + 1]; j < binPoints[i + 2]; j++) {
      filter[j] = (binPoints[i + 2] - j) / (binPoints[i + 2] - binPoints[i + 1])
    }
    filterbank.push(filter)
  }

  return filterbank
}

export function computeMelSpectrogram(
  audioData: Float32Array,
  sampleRate: number = 16000,
  fftSize: number = 512,
  hopLength: number = 160,
  numMelBins: number = 16,
): Float32Array {
  const window = hannWindow(fftSize)
  const fft = new FFT(fftSize)
  const melFilterbank = createMelFilterbank(numMelBins, fftSize, sampleRate)

  const numFrames = Math.floor((audioData.length - fftSize) / hopLength) + 1
  const spectrogram = new Float32Array(numMelBins * numFrames)

  const real = new Float32Array(fftSize)
  const imag = new Float32Array(fftSize)

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopLength

    for (let i = 0; i < fftSize; i++) {
      real[i] = (audioData[start + i] || 0) * window[i]
      imag[i] = 0
    }

    fft.forward(real, imag)

    const magnitude = new Float32Array(fftSize / 2 + 1)
    for (let i = 0; i <= fftSize / 2; i++) {
      magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i])
    }

    for (let melBin = 0; melBin < numMelBins; melBin++) {
      let sum = 0
      const filter = melFilterbank[melBin]
      for (let i = 0; i <= fftSize / 2; i++) {
        sum += magnitude[i] * filter[i]
      }
      spectrogram[melBin * numFrames + frame] = Math.log(sum + 1e-10)
    }
  }

  return spectrogram
}

export function normalizeAudio(audioData: Int16Array): Float32Array {
  const normalized = new Float32Array(audioData.length)
  for (let i = 0; i < audioData.length; i++) {
    normalized[i] = audioData[i] / 32768.0
  }
  return normalized
}
