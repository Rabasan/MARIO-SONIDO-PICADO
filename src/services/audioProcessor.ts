/**
 * Audio analysis service to detect sound onset and offset.
 */

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private stream: MediaStream | null = null;
  private threshold: number = 30; // Sensitivity threshold
  private isSounding: boolean = false;

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      
      this.analyser.fftSize = 256;
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      this.microphone.connect(this.analyser);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      throw err;
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  setThreshold(value: number) {
    this.threshold = value;
  }

  getVolume(): number {
    if (!this.analyser || !this.dataArray) return 0;
    this.analyser.getByteFrequencyData(this.dataArray);
    
    // Use the maximum value (peak) instead of average for better note detection
    let max = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      if (this.dataArray[i] > max) {
        max = this.dataArray[i];
      }
    }
    return max;
  }

  checkSound(): { onset: boolean; offset: boolean; isSounding: boolean } {
    const volume = this.getVolume();
    const nowSounding = volume > this.threshold;
    
    let onset = false;
    let offset = false;

    if (nowSounding && !this.isSounding) {
      onset = true;
    } else if (!nowSounding && this.isSounding) {
      offset = true;
    }

    this.isSounding = nowSounding;
    return { onset, offset, isSounding: this.isSounding };
  }
}
