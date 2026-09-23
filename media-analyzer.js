/**
 * media-analyzer.js
 * 纯前端高精度多媒体深度分析引擎 (ES Module)
 * 包含：
 * 1. 音频全局交互式波形图 (Interactive Waveform with Seek & Hover)
 * 2. 音频声学质检面板 (峰值/削波失真/有效RMS/动态范围/首尾静音/立体声相位)
 * 3. 图像主要色调调色板提取 (Color Palette with one-click HEX copy) 与影调明暗分析 (Tone & Luminance)
 * 4. 图像专业示波器引擎 (直方图 / 矢量示波图 / RGB分量图)
 * 5. 视频胶卷缩略图时间线序列 (Timeline Filmstrip with Click-to-Seek)
 */

// ==========================================
// 1. 音频深度声学分析与交互波形图引擎
// ==========================================

let activeWaveformController = null;

/**
 * 解码并分析音频二进制流
 * @param {ArrayBuffer} arrayBuffer 音频文件二进制流
 * @returns {Promise<Object>} 深度声学指标
 */
export async function analyzeAudioBuffer(arrayBuffer) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('浏览器不支持 Web Audio API');
  const audioCtx = new AudioCtx();

  // 必须 slice(0)，防止 decodeAudioData 游离/移走底层 ArrayBuffer
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = numChannels > 1 ? audioBuffer.getChannelData(1) : null;

  // 1. 遍历抽样计算峰值、削波、有效电平与静音
  let maxAbs = 0;
  let sumSq = 0;
  let clippingCount = 0;
  const clipThreshold = 0.999;
  const silenceThreshold = 0.001; // 约 -60 dBFS

  // 步长采样优化大文件 (最多采样 600,000 点以保证毫秒级完成，小文件全量遍历)
  const step = Math.max(1, Math.floor(length / 600000));
  let sampledCount = 0;

  for (let i = 0; i < length; i += step) {
    const val0 = ch0[i];
    const val1 = ch1 ? ch1[i] : val0;
    const v = Math.max(Math.abs(val0), Math.abs(val1));

    if (v > maxAbs) maxAbs = v;
    if (v >= clipThreshold) clippingCount += step;
    sumSq += v * v;
    sampledCount++;
  }

  const rms = Math.sqrt(sumSq / sampledCount);
  const peakDb = maxAbs > 0 ? (20 * Math.log10(maxAbs)) : -100;
  const rmsDb = rms > 0 ? (20 * Math.log10(rms)) : -100;
  const dynamicRangeDb = Math.max(0, peakDb - rmsDb);

  // 2. 检测开头与结尾静音时长
  let leadSilentSamples = 0;
  for (let i = 0; i < length; i++) {
    const v0 = Math.abs(ch0[i]);
    const v1 = ch1 ? Math.abs(ch1[i]) : 0;
    if (v0 > silenceThreshold || v1 > silenceThreshold) break;
    leadSilentSamples++;
  }
  const leadingSilenceSec = leadSilentSamples / sampleRate;

  let trailSilentSamples = 0;
  for (let i = length - 1; i >= 0; i--) {
    const v0 = Math.abs(ch0[i]);
    const v1 = ch1 ? Math.abs(ch1[i]) : 0;
    if (v0 > silenceThreshold || v1 > silenceThreshold) break;
    trailSilentSamples++;
  }
  const trailingSilenceSec = trailSilentSamples / sampleRate;

  // 3. 双声道平衡与相位相关度
  let stereoBalance = null;
  let phaseCorrelation = null;
  if (ch1) {
    let sumSq0 = 0, sumSq1 = 0, sumCross = 0;
    for (let i = 0; i < length; i += step) {
      const l = ch0[i];
      const r = ch1[i];
      sumSq0 += l * l;
      sumSq1 += r * r;
      sumCross += l * r;
    }
    const rms0 = Math.sqrt(sumSq0 / sampledCount);
    const rms1 = Math.sqrt(sumSq1 / sampledCount);
    const totalRms = (rms0 + rms1) || 0.0001;
    const leftPercent = Math.round((rms0 / totalRms) * 100);
    const rightPercent = 100 - leftPercent;

    let balDesc = '完全居中平衡';
    if (leftPercent > 53) balDesc = `轻微偏左 (+${leftPercent - 50}%)`;
    else if (rightPercent > 53) balDesc = `轻微偏右 (+${rightPercent - 50}%)`;

    const denom = Math.sqrt(sumSq0 * sumSq1);
    const corr = denom > 0 ? (sumCross / denom) : 1;
    let corrDesc = '优质立体声 (宽阔清晰)';
    if (corr > 0.85) corrDesc = '单声道/高度聚中 (一致性极高)';
    else if (corr >= 0.5) corrDesc = '标准立体声 (自然分离度)';
    else if (corr >= 0.1) corrDesc = '超宽环绕立体声';
    else if (corr >= -0.2) corrDesc = '极宽立体声 (临界边缘)';
    else corrDesc = '⚠️ 存在反相风险 (单声道外放人声将抵消)';

    stereoBalance = { leftPercent, rightPercent, desc: balDesc };
    phaseCorrelation = { value: corr, desc: corrDesc };
  }

  // 4. 提取 360 个归一化波峰 (用于绘制波形图)
  const numBuckets = 360;
  const bucketSize = Math.floor(length / numBuckets);
  const peaksData = new Float32Array(numBuckets);

  for (let b = 0; b < numBuckets; b++) {
    const start = b * bucketSize;
    const end = Math.min(start + bucketSize, length);
    let peakInBucket = 0;
    for (let i = start; i < end; i += Math.max(1, Math.floor((end - start) / 50))) {
      const v = Math.abs(ch0[i]);
      if (v > peakInBucket) peakInBucket = v;
    }
    peaksData[b] = peakInBucket;
  }

  // 关闭临时 AudioContext 释放系统音频设备
  if (audioCtx.state !== 'closed') {
    audioCtx.close().catch(() => {});
  }

  return {
    duration,
    sampleRate,
    numChannels,
    peakVal: maxAbs,
    peakDb: Number(peakDb.toFixed(2)),
    rmsDb: Number(rmsDb.toFixed(2)),
    dynamicRangeDb: Number(dynamicRangeDb.toFixed(2)),
    clippingCount,
    hasClipping: clippingCount > 0,
    leadingSilenceSec: Number(leadingSilenceSec.toFixed(3)),
    trailingSilenceSec: Number(trailingSilenceSec.toFixed(3)),
    stereoBalance,
    phaseCorrelation,
    peaksData,
  };
}

/**
 * 挂载并渲染交互式全局声波图
 */
export function mountWaveformViewer(container, peaksData, audioElement, duration) {
  if (activeWaveformController) {
    activeWaveformController.destroy();
    activeWaveformController = null;
  }

  container.innerHTML = `
    <div class="bg-slate-900/90 rounded-2xl p-5 border border-slate-700/80 shadow-inner space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span class="text-indigo-400 font-bold text-sm">🌊 全局交互式声波图 (Interactive Waveform)</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 font-mono border border-indigo-800/60">可点击跳转</span>
        </div>
        <div id="waveTimeDisplay" class="text-xs font-mono text-slate-300">
          <span id="waveCurrentTime" class="text-indigo-400 font-bold">00:00</span> / <span id="waveTotalTime" class="text-slate-400">00:00</span>
        </div>
      </div>

      <!-- 交互画布容器 -->
      <div class="relative w-full h-24 sm:h-28 cursor-pointer select-none group" id="waveCanvasWrapper">
        <canvas id="waveCanvas" class="w-full h-full block rounded-xl"></canvas>
        <!-- 悬停指示线与时间标尺浮层 -->
        <div id="waveHoverLine" class="hidden absolute top-0 bottom-0 w-px bg-white/80 pointer-events-none z-10">
          <span id="waveHoverTime" class="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono text-[10px] shadow border border-slate-600 whitespace-nowrap">00:00</span>
        </div>
      </div>

      <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
        <span>00:00</span>
        <span class="text-slate-500">提示: 点击波形任意位置即可快速跳转播放 · 支持鼠标悬停时间预览</span>
        <span>${formatTime(duration)}</span>
      </div>
    </div>
  `;

  const canvas = container.querySelector('#waveCanvas');
  const wrapper = container.querySelector('#waveCanvasWrapper');
  const hoverLine = container.querySelector('#waveHoverLine');
  const hoverTime = container.querySelector('#waveHoverTime');
  const currentTimeEl = container.querySelector('#waveCurrentTime');
  const totalTimeEl = container.querySelector('#waveTotalTime');

  totalTimeEl.innerText = formatTime(duration);

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    canvas.width = wrapper.clientWidth * dpr;
    canvas.height = wrapper.clientHeight * dpr;
    drawWave();
  }

  function drawWave() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const progress = duration > 0 ? (audioElement.currentTime / duration) : 0;
    const splitX = Math.floor(w * progress);

    const count = peaksData.length;
    const barWidth = Math.max(2 * dpr, (w / count) * 0.75);
    const centerY = h / 2;

    for (let i = 0; i < count; i++) {
      const x = i * (w / count);
      const amp = Math.max(0.06, peaksData[i]); // 最低高度保障
      const barH = amp * (h * 0.42);

      const isPlayed = x <= splitX;

      // 未播放波形：灰白微透；已播放波形：青绿蓝紫渐变
      if (isPlayed) {
        const grad = ctx.createLinearGradient(0, centerY - barH, 0, centerY + barH);
        grad.addColorStop(0, '#06b6d4');
        grad.addColorStop(0.5, '#6366f1');
        grad.addColorStop(1, '#a855f7');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
      }

      // 上下对称声波柱
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, centerY - barH, barWidth, barH * 2, 2 * dpr);
      } else {
        ctx.rect(x, centerY - barH, barWidth, barH * 2);
      }
      ctx.fill();
    }

    // 播放指针垂直高亮针
    if (splitX > 0 && splitX < w) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(99, 102, 241, 0.8)';
      ctx.shadowBlur = 6 * dpr;
      ctx.fillRect(splitX - (1 * dpr), 0, 2 * dpr, h);
      ctx.shadowBlur = 0;
    }
  }

  // 窗口改变时自适应重绘
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // 播放进度监听
  const onTimeUpdate = () => {
    currentTimeEl.innerText = formatTime(audioElement.currentTime);
    drawWave();
  };
  audioElement.addEventListener('timeupdate', onTimeUpdate);

  // 交互点击跳转 (Seek)
  const onCanvasClick = (e) => {
    const rect = wrapper.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioElement.currentTime = ratio * duration;
    if (audioElement.paused) {
      audioElement.play().catch(() => {});
    }
    drawWave();
  };
  wrapper.addEventListener('click', onCanvasClick);

  // 悬停预览时间标尺
  const onMouseMove = (e) => {
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    hoverLine.style.left = `${x}px`;
    hoverTime.innerText = formatTime(ratio * duration);
    hoverLine.classList.remove('hidden');
  };
  const onMouseLeave = () => {
    hoverLine.classList.add('hidden');
  };
  wrapper.addEventListener('mousemove', onMouseMove);
  wrapper.addEventListener('mouseleave', onMouseLeave);

  activeWaveformController = {
    destroy: () => {
      window.removeEventListener('resize', resizeCanvas);
      audioElement.removeEventListener('timeupdate', onTimeUpdate);
      wrapper.removeEventListener('click', onCanvasClick);
      wrapper.removeEventListener('mousemove', onMouseMove);
      wrapper.removeEventListener('mouseleave', onMouseLeave);
    }
  };

  return activeWaveformController;
}

/**
 * 渲染音频声学与音质检测卡片
 */
export function renderAudioHealthCard(container, metrics) {
  const {
    peakDb,
    rmsDb,
    dynamicRangeDb,
    hasClipping,
    clippingCount,
    leadingSilenceSec,
    trailingSilenceSec,
    stereoBalance,
    phaseCorrelation,
  } = metrics;

  // 动态范围评价
  let drRating = '标准中等动态';
  let drBadgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';
  if (dynamicRangeDb >= 15) {
    drRating = '极佳 (录音室原声/高保真)';
    drBadgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
  } else if (dynamicRangeDb < 8) {
    drRating = '过度压缩 (响度战争/商业舞曲)';
    drBadgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
  }

  container.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
        <div class="flex items-center space-x-2">
          <span class="text-xl">🩺</span>
          <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100">音频质检与动态范围检测 (Acoustic Quality)</h4>
        </div>
        <span class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${hasClipping ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'}">
          ${hasClipping ? '⚠️ 存在爆音削波风险' : '✓ 峰值健康无削波'}
        </span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs sm:text-sm">
        <!-- 1. 峰值电平 -->
        <div class="p-3.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl space-y-1">
          <span class="text-slate-400 text-xs block">最高峰值电平 (Peak)</span>
          <div class="flex items-baseline space-x-1.5">
            <span class="font-mono font-bold text-base ${hasClipping ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}">${peakDb} dBFS</span>
          </div>
          <span class="text-[10px] block ${hasClipping ? 'text-rose-500 font-semibold' : 'text-slate-400'}">
            ${hasClipping ? `检测到约 ${clippingCount} 处削波失真` : `安全余量: ${(0 - peakDb).toFixed(2)} dB`}
          </span>
        </div>

        <!-- 2. 有效均方根电平 -->
        <div class="p-3.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl space-y-1">
          <span class="text-slate-400 text-xs block">平均感知响度 (RMS)</span>
          <span class="font-mono font-bold text-base text-indigo-600 dark:text-indigo-400 block">${rmsDb} dBFS</span>
          <span class="text-[10px] text-slate-400 block">连续声能平均电平</span>
        </div>

        <!-- 3. 动态范围 -->
        <div class="p-3.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl space-y-1">
          <span class="text-slate-400 text-xs block">动态范围 (Peak - RMS)</span>
          <span class="font-mono font-bold text-base text-teal-600 dark:text-teal-400 block">${dynamicRangeDb} dB</span>
          <span class="text-[10px] ${drBadgeClass} px-1.5 py-0.5 rounded inline-block font-medium">${drRating}</span>
        </div>

        <!-- 4. 首尾静音分析 -->
        <div class="p-3.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl space-y-1">
          <span class="text-slate-400 text-xs block">空白静音段分析 (-60dB)</span>
          <div class="font-mono text-slate-700 dark:text-slate-200 text-xs space-y-0.5 font-medium">
            <div>前置空白: <span class="font-bold text-slate-800 dark:text-slate-100">${leadingSilenceSec}s</span></div>
            <div>末尾尾音: <span class="font-bold text-slate-800 dark:text-slate-100">${trailingSilenceSec}s</span></div>
          </div>
        </div>

        <!-- 5. 立体声相位与声道平衡 (若有) -->
        ${stereoBalance ? `
        <div class="p-3.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl col-span-2 sm:col-span-4 flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-0.5">
            <span class="text-slate-400 text-xs block">立体声声场与声道平衡</span>
            <div class="text-xs font-medium text-slate-800 dark:text-slate-200">
              左右能量: <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">L ${stereoBalance.leftPercent}% : R ${stereoBalance.rightPercent}%</span> (${stereoBalance.desc})
            </div>
          </div>
          <div class="space-y-0.5 sm:text-right">
            <span class="text-slate-400 text-xs block">相位相关系数 (Phase Correlation)</span>
            <div class="text-xs font-mono font-bold ${phaseCorrelation.value < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}">
              ${phaseCorrelation.value > 0 ? '+' : ''}${phaseCorrelation.value.toFixed(3)} · ${phaseCorrelation.desc}
            </div>
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ==========================================
// 2. 图像调色板提取与影调分析引擎
// ==========================================

/**
 * 从 HTMLImageElement 快速提取调色板与影调分布
 */
export function extractImagePaletteAndTone(imgElement, container, onCopyCallback) {
  const canvas = document.createElement('canvas');
  const maxSide = 120;
  let w = imgElement.naturalWidth || imgElement.width || 120;
  let h = imgElement.naturalHeight || imgElement.height || 120;

  if (w > h) {
    if (w > maxSide) { h = Math.round((h * maxSide) / w); w = maxSide; }
  } else {
    if (h > maxSide) { w = Math.round((w * maxSide) / h); h = maxSide; }
  }

  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgElement, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h).data;
  const totalPixels = w * h;

  // 1. 颜色聚类量化 (5-bit 量化，步长 8)
  const colorBuckets = new Map();
  let totalLuminance = 0;
  const lumHistogram = [0, 0, 0, 0, 0]; // 5 个影调区间

  for (let i = 0; i < imgData.length; i += 4) {
    const a = imgData[i + 3];
    if (a < 128) continue; // 忽略高透

    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];

    // 感知亮度 (ITU-R BT.601)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuminance += lum;

    // 影调直方区间
    const lumIdx = Math.min(4, Math.floor(lum / 51.2));
    lumHistogram[lumIdx]++;

    // 量化压缩分组
    const qr = Math.round(r / 16) * 16;
    const qg = Math.round(g / 16) * 16;
    const qb = Math.round(b / 16) * 16;
    const key = (qr << 16) | (qg << 8) | qb;

    colorBuckets.set(key, (colorBuckets.get(key) || 0) + 1);
  }

  // 2. 排序与邻近色融合 (合并距离小于 36 的相近色)
  const sortedBins = Array.from(colorBuckets.entries())
    .map(([key, count]) => {
      const r = (key >> 16) & 0xff;
      const g = (key >> 8) & 0xff;
      const b = key & 0xff;
      return { r, g, b, count };
    })
    .sort((a, b) => b.count - a.count);

  const distinctColors = [];
  for (const bin of sortedBins) {
    let isMerged = false;
    for (const d of distinctColors) {
      const dist = Math.sqrt((bin.r - d.r) ** 2 + (bin.g - d.g) ** 2 + (bin.b - d.b) ** 2);
      if (dist < 36) {
        d.count += bin.count;
        isMerged = true;
        break;
      }
    }
    if (!isMerged) {
      distinctColors.push({ ...bin });
      if (distinctColors.length >= 6) break;
    }
  }

  // 计算色彩占比百分比
  const totalCount = distinctColors.reduce((sum, c) => sum + c.count, 0) || 1;
  const palette = distinctColors.map(c => {
    const hex = rgbToHex(c.r, c.g, c.b);
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    const textColor = lum > 140 ? '#0f172a' : '#ffffff';
    const percent = ((c.count / totalCount) * 100).toFixed(1);
    const name = getColorDescriptiveName(c.r, c.g, c.b);
    return { ...c, hex, percent, textColor, name };
  });

  // 3. 影调与明暗分布评估
  const avgLum = Math.round(totalLuminance / totalPixels);
  let toneStyle = '中性调 (Mid-Key · 层次均衡)';
  let toneBadgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';
  if (avgLum >= 165) {
    toneStyle = '高调摄影 (High-Key · 亮丽通透)';
    toneBadgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
  } else if (avgLum <= 85) {
    toneStyle = '低调摄影 (Low-Key · 深沉暗雅)';
    toneBadgeClass = 'bg-slate-700 text-slate-100';
  }

  // 4. 渲染 UI
  container.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
        <div class="flex items-center space-x-2">
          <span class="text-xl">🎨</span>
          <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100">主要色调调色板与影调分析 (Color Palette & Tone)</h4>
        </div>
        <span class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${toneBadgeClass}">
          ${toneStyle}
        </span>
      </div>

      <!-- 6 种代表性主要色块卡片 -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-slate-400 font-medium">画面代表性色彩提炼 (点击任意色块一键复制 HEX 代码):</span>
          <span class="text-[11px] text-indigo-500 font-medium font-mono">Top ${palette.length} Dominant Colors</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          ${palette.map(p => `
            <button class="btn-copy-color group text-left rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-700/80 hover:shadow-md transition bg-slate-50 dark:bg-slate-900/40 relative overflow-hidden" data-hex="${p.hex}">
              <div class="w-full h-14 rounded-lg shadow-inner flex items-center justify-center font-mono font-bold text-xs transition transform group-hover:scale-105" style="background-color: ${p.hex}; color: ${p.textColor};">
                <span>${p.hex}</span>
              </div>
              <div class="mt-2 text-xs">
                <div class="font-bold text-slate-800 dark:text-slate-100 truncate">${p.name}</div>
                <div class="text-[11px] text-slate-400 font-mono mt-0.5 flex justify-between items-center">
                  <span>占比 ${p.percent}%</span>
                  <span class="group-hover:text-indigo-500 font-sans">复制</span>
                </div>
              </div>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- 影调明暗直方条 -->
      <div class="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div class="flex items-center space-x-3">
          <span class="text-slate-500 dark:text-slate-400">平均感知明度:</span>
          <strong class="font-mono text-slate-800 dark:text-slate-100 text-sm">${avgLum} / 255</strong>
          <span class="text-[11px] text-slate-400 font-mono">(${((avgLum / 255) * 100).toFixed(1)}%)</span>
        </div>

        <div class="flex items-center space-x-1 flex-1 max-w-xs">
          <span class="text-[10px] text-slate-400 pr-1">暗</span>
          <div class="flex-1 flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700">
            <div class="bg-slate-800" style="width: ${(lumHistogram[0] / totalPixels * 100).toFixed(1)}%" title="纯暗部"></div>
            <div class="bg-indigo-900" style="width: ${(lumHistogram[1] / totalPixels * 100).toFixed(1)}%" title="暗中间调"></div>
            <div class="bg-indigo-500" style="width: ${(lumHistogram[2] / totalPixels * 100).toFixed(1)}%" title="中间调"></div>
            <div class="bg-amber-400" style="width: ${(lumHistogram[3] / totalPixels * 100).toFixed(1)}%" title="亮中间调"></div>
            <div class="bg-amber-100" style="width: ${(lumHistogram[4] / totalPixels * 100).toFixed(1)}%" title="高光极亮"></div>
          </div>
          <span class="text-[10px] text-slate-400 pl-1">亮</span>
        </div>
      </div>
    </div>
  `;

  // 绑定色块复制事件
  container.querySelectorAll('.btn-copy-color').forEach(btn => {
    btn.addEventListener('click', () => {
      const hex = btn.getAttribute('data-hex');
      if (onCopyCallback) onCopyCallback(hex);
    });
  });
}

// ==========================================
// 3. 图像专业示波器引擎 (直方图 / 矢量示波图 / RGB 分量图)
// ==========================================

/**
 * 渲染专业图像示波器 (直方图、矢量图、RGB分量图)
 * @param {HTMLImageElement} imgElement 图像元素
 * @param {HTMLElement} container 目标容器
 */
export function renderImageScopes(imgElement, container) {
  // 1. 离屏采样缩放，兼顾极高精度与毫秒级极速渲染 (最大宽 480，高 320)
  const maxW = 480;
  const maxH = 320;
  let w = imgElement.naturalWidth || imgElement.width || 480;
  let h = imgElement.naturalHeight || imgElement.height || 320;
  if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
  if (h > maxH) { w = Math.round((w * maxH) / h); h = maxH; }

  const offCanvas = document.createElement('canvas');
  offCanvas.width = Math.max(1, w);
  offCanvas.height = Math.max(1, h);
  const offCtx = offCanvas.getContext('2d');
  offCtx.drawImage(imgElement, 0, 0, w, h);

  const imgData = offCtx.getImageData(0, 0, w, h).data;
  const pixelCount = w * h;

  // 2. 统计 256-bin 直方图数据与均值
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  const histY = new Uint32Array(256);

  let sumR = 0, sumG = 0, sumB = 0, sumY = 0;
  let shadowClipCount = 0;
  let highlightClipCount = 0;

  for (let i = 0; i < imgData.length; i += 4) {
    const a = imgData[i + 3];
    if (a < 128) continue;

    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    histR[r]++;
    histG[g]++;
    histB[b]++;
    histY[y]++;

    sumR += r;
    sumG += g;
    sumB += b;
    sumY += y;

    if (y === 0) shadowClipCount++;
    if (y === 255) highlightClipCount++;
  }

  const meanR = (sumR / pixelCount).toFixed(1);
  const meanG = (sumG / pixelCount).toFixed(1);
  const meanB = (sumB / pixelCount).toFixed(1);
  const shadowClipPct = ((shadowClipCount / pixelCount) * 100).toFixed(1);
  const highlightClipPct = ((highlightClipCount / pixelCount) * 100).toFixed(1);

  // 3. 构建 HTML 框架 (3 个示波器卡片并列)
  container.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700">
        <div class="flex items-center space-x-2">
          <span class="text-xl">🔬</span>
          <div>
            <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100">专业图像示波与色彩分量分析 (Scopes & Distribution)</h4>
            <span class="text-[11px] text-slate-400">达芬奇 / 摄影专业监视器级示波体系 (直方图 · 矢量示波 · RGB分量)</span>
          </div>
        </div>
        <div class="flex items-center space-x-2 text-xs font-mono">
          <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            暗部溢出: <strong class="${shadowClipPct > 1 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'}">${shadowClipPct}%</strong>
          </span>
          <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            高光过曝: <strong class="${highlightClipPct > 1 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'}">${highlightClipPct}%</strong>
          </span>
        </div>
      </div>

      <!-- 3 个专业示波图并列网格 -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- 1. 直方图 (Histogram) -->
        <div class="bg-slate-950 rounded-xl p-4 border border-slate-800 flex flex-col justify-between space-y-3">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span class="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
              <span>📊</span>
              <span>曝光直方图 (Histogram)</span>
            </span>
            <!-- 通道切换器 -->
            <div id="histChannelBtns" class="flex items-center space-x-1 text-[10px] font-mono">
              <button class="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold" data-mode="rgb">RGB</button>
              <button class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300" data-mode="y">Y</button>
              <button class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-rose-400" data-mode="r">R</button>
              <button class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400" data-mode="g">G</button>
              <button class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400" data-mode="b">B</button>
            </div>
          </div>

          <div class="relative w-full h-44">
            <canvas id="scopeHistogramCanvas" class="w-full h-full block rounded-lg"></canvas>
          </div>

          <div class="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
            <span>0 (暗部死黑)</span>
            <span>128 (曝光中灰)</span>
            <span>255 (高光极白)</span>
          </div>
        </div>

        <!-- 2. 矢量示波图 (Vectorscope) -->
        <div class="bg-slate-950 rounded-xl p-4 border border-slate-800 flex flex-col justify-between space-y-3">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span class="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
              <span>🎯</span>
              <span>矢量示波图 (Vectorscope)</span>
            </span>
            <span class="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-900/60">
              带肤色基准线 (Skin)
            </span>
          </div>

          <div class="relative w-full h-44 flex items-center justify-center">
            <canvas id="scopeVectorscopeCanvas" class="h-full aspect-square block"></canvas>
          </div>

          <div class="text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-2 flex justify-between">
            <span>中心: 无饱和黑白灰</span>
            <span>外圈: 100% 极色饱和</span>
          </div>
        </div>

        <!-- 3. RGB 分量示波图 (RGB Parade) -->
        <div class="bg-slate-950 rounded-xl p-4 border border-slate-800 flex flex-col justify-between space-y-3">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span class="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
              <span>📈</span>
              <span>RGB 分量示波图 (Parade)</span>
            </span>
            <div class="flex items-center space-x-2 text-[10px] font-mono text-slate-400">
              <span class="text-rose-400 font-bold">R:${meanR}</span>
              <span class="text-emerald-400 font-bold">G:${meanG}</span>
              <span class="text-blue-400 font-bold">B:${meanB}</span>
            </div>
          </div>

          <div class="relative w-full h-44">
            <canvas id="scopeParadeCanvas" class="w-full h-full block rounded-lg"></canvas>
          </div>

          <div class="grid grid-cols-3 text-center text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
            <span class="text-rose-400 font-bold">红分量 (Red)</span>
            <span class="text-emerald-400 font-bold">绿分量 (Green)</span>
            <span class="text-blue-400 font-bold">蓝分量 (Blue)</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // 工具函数：安全获取画布尺寸，杜绝为 0 的问题
  function getCanvasDims(cvs, fallbackW = 340, fallbackH = 176) {
    const dpr = window.devicePixelRatio || 1;
    const rect = cvs.getBoundingClientRect();
    const parent = cvs.parentElement;
    const pRect = parent ? parent.getBoundingClientRect() : null;
    const rawW = rect.width || cvs.clientWidth || (pRect ? pRect.width : 0) || fallbackW;
    const rawH = rect.height || cvs.clientHeight || (pRect ? pRect.height : 0) || fallbackH;
    const cw = Math.max(160, Math.floor(rawW * dpr));
    const ch = Math.max(120, Math.floor(rawH * dpr));
    cvs.width = cw;
    cvs.height = ch;
    return { cw, ch, dpr };
  }

  // ----------------------------------------
  // 绘制 1: 直方图渲染逻辑
  // ----------------------------------------
  const histCanvas = container.querySelector('#scopeHistogramCanvas');
  let currentHistMode = 'rgb';

  function drawHistogram() {
    const { cw, ch, dpr } = getCanvasDims(histCanvas, 340, 176);
    const ctx = histCanvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);

    // 计算峰值高度基准 (取 1~254 中的 98% 峰值，避免 0 或 255 的尖峰压扁整个曲线)
    let maxBinVal = 1;
    for (let i = 1; i < 255; i++) {
      if (histR[i] > maxBinVal) maxBinVal = histR[i];
      if (histG[i] > maxBinVal) maxBinVal = histG[i];
      if (histB[i] > maxBinVal) maxBinVal = histB[i];
      if (histY[i] > maxBinVal) maxBinVal = histY[i];
    }
    maxBinVal = maxBinVal * 1.08;

    // 绘制参考刻度虚线 (25%, 50%, 75%)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    [0.25, 0.5, 0.75].forEach(r => {
      const gx = cw * r;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, ch);
      ctx.stroke();

      const gy = ch * (1 - r);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(cw, gy);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    function drawChannelCurve(histArray, strokeColor, fillColor) {
      ctx.beginPath();
      ctx.moveTo(0, ch);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * cw;
        const v = Math.min(histArray[i], maxBinVal);
        const y = ch - (v / maxBinVal) * ch;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cw, ch);
      ctx.closePath();

      if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.8 * dpr;
      ctx.stroke();
    }

    if (currentHistMode === 'rgb') {
      ctx.globalCompositeOperation = 'screen';
      drawChannelCurve(histR, '#f43f5e', 'rgba(244, 63, 94, 0.45)');
      drawChannelCurve(histG, '#22c55e', 'rgba(34, 197, 94, 0.45)');
      drawChannelCurve(histB, '#3b82f6', 'rgba(59, 130, 246, 0.45)');
      ctx.globalCompositeOperation = 'source-over';
    } else if (currentHistMode === 'y') {
      drawChannelCurve(histY, '#f8fafc', 'rgba(248, 250, 252, 0.35)');
    } else if (currentHistMode === 'r') {
      drawChannelCurve(histR, '#ef4444', 'rgba(239, 68, 68, 0.45)');
    } else if (currentHistMode === 'g') {
      drawChannelCurve(histG, '#22c55e', 'rgba(34, 197, 94, 0.45)');
    } else if (currentHistMode === 'b') {
      drawChannelCurve(histB, '#3b82f6', 'rgba(59, 130, 246, 0.45)');
    }
  }

  // 直方图模式切换监听
  const histBtns = container.querySelectorAll('#histChannelBtns button');
  histBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      histBtns.forEach(b => {
        b.className = 'px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300';
      });
      btn.className = 'px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold';
      currentHistMode = btn.getAttribute('data-mode');
      drawHistogram();
    });
  });

  // ----------------------------------------
  // 绘制 2: 矢量示波图 (Vectorscope) 渲染逻辑
  // ----------------------------------------
  const vecCanvas = container.querySelector('#scopeVectorscopeCanvas');

  function drawVectorscope() {
    const parent = vecCanvas.parentElement;
    const parentRect = parent ? parent.getBoundingClientRect() : null;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.max(140, Math.floor(Math.min((parentRect ? parentRect.width : 0) || vecCanvas.clientWidth || 180, (parentRect ? parentRect.height : 0) || vecCanvas.clientHeight || 180) * dpr));
    vecCanvas.width = size;
    vecCanvas.height = size;
    const ctx = vecCanvas.getContext('2d');
    const cw = vecCanvas.width;
    const ch = vecCanvas.height;
    const cx = cw / 2;
    const cy = ch / 2;
    const radius = (Math.min(cw, ch) / 2) * 0.88;

    ctx.clearRect(0, 0, cw, ch);

    // 绘制极坐标同心环刻度 (25%, 50%, 75%, 100%)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1 * dpr;
    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * ratio, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 十字中心标尺
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // 肤色基准指示线 (Skin Tone Line / I-Line, 角度约为 128 度，指向黄红之间)
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    const skinAngle = (128 * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(skinAngle) * radius, cy - Math.sin(skinAngle) * radius);
    ctx.stroke();
    ctx.restore();

    // 肤色文字标签
    ctx.fillStyle = '#f59e0b';
    ctx.font = `${Math.round(8 * dpr)}px sans-serif`;
    ctx.fillText('肤色线 (Skin)', cx + Math.cos(skinAngle) * radius * 0.65 - 20 * dpr, cy - Math.sin(skinAngle) * radius * 0.65 - 4 * dpr);

    // 6 个原色/间色标准目标靶框 (Targets: R, Mg, B, Cy, G, Yl)
    const targets = [
      { name: 'R',  r: 255, g: 0,   b: 0,   cb: -43,  cr: 127,  color: '#ef4444' },
      { name: 'Mg', r: 255, g: 0,   b: 255, cb: 84,   cr: 106,  color: '#d946ef' },
      { name: 'B',  r: 0,   g: 0,   b: 255, cb: 127,  cr: -21,  color: '#3b82f6' },
      { name: 'Cy', r: 0,   g: 255, b: 255, cb: 43,   cr: -127, color: '#06b6d4' },
      { name: 'G',  r: 0,   g: 255, b: 0,   cb: -84,  cr: -106, color: '#22c55e' },
      { name: 'Yl', r: 255, g: 255, b: 0,   cb: -127, cr: 21,   color: '#eab308' },
    ];

    targets.forEach(t => {
      const tx = cx + (t.cb / 128) * radius * 0.75;
      const ty = cy - (t.cr / 128) * radius * 0.75;

      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(tx - 4 * dpr, ty - 4 * dpr, 8 * dpr, 8 * dpr);

      ctx.fillStyle = t.color;
      ctx.font = `bold ${Math.round(8 * dpr)}px monospace`;
      ctx.fillText(t.name, tx + 6 * dpr, ty + 3 * dpr);
    });

    // 绘制像素色彩分布荧光云 (均匀抽样最多 24,000 像素以保持极速流畅)
    const sampleStep = Math.max(1, Math.floor(pixelCount / 24000));
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < imgData.length; i += 4 * sampleStep) {
      const a = imgData[i + 3];
      if (a < 128) continue;

      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];

      const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;

      const px = cx + (cb / 128) * radius;
      const py = cy - (cr / 128) * radius;

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
      ctx.fillRect(px, py, 1.8 * dpr, 1.8 * dpr);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ----------------------------------------
  // 绘制 3: RGB 分量示波图 (RGB Parade)
  // ----------------------------------------
  const paradeCanvas = container.querySelector('#scopeParadeCanvas');

  function drawParade() {
    const { cw, ch, dpr } = getCanvasDims(paradeCanvas, 340, 176);
    const ctx = paradeCanvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);

    const sectionW = cw / 3;
    const pad = 4 * dpr;

    // 绘制横向参考基准刻度 (0%, 25%, 50%, 75%, 100%)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    [0.05, 0.25, 0.5, 0.75, 0.95].forEach(r => {
      const y = ch * (1 - r);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 绘制三栏分隔竖线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(sectionW, 0);
    ctx.lineTo(sectionW, ch);
    ctx.moveTo(sectionW * 2, 0);
    ctx.lineTo(sectionW * 2, ch);
    ctx.stroke();

    // 逐通道清晰绘制波形
    const usableW = sectionW - pad * 2;
    const numCols = Math.max(20, Math.min(140, Math.floor(usableW / (1.5 * dpr))));
    const usableH = ch - 16 * dpr;
    const baseY = ch - 8 * dpr;

    const channels = [
      { name: 'Red',   offset: 0,              color: 'rgba(255, 77, 79, 0.85)',   envColor: 'rgba(255, 77, 79, 0.15)', byteIdx: 0 },
      { name: 'Green', offset: sectionW,      color: 'rgba(82, 196, 26, 0.85)',   envColor: 'rgba(82, 196, 26, 0.15)', byteIdx: 1 },
      { name: 'Blue',  offset: sectionW * 2,  color: 'rgba(59, 130, 246, 0.85)',  envColor: 'rgba(59, 130, 246, 0.15)', byteIdx: 2 },
    ];

    channels.forEach(chInfo => {
      const startX = chInfo.offset + pad;

      for (let c = 0; c < numCols; c++) {
        const normX = c / numCols;
        const imgX = Math.min(w - 1, Math.floor(normX * w));
        const plotX = startX + normX * usableW;

        let minVal = 255, maxVal = 0;
        const rowStep = Math.max(1, Math.floor(h / 70));

        // 采样并绘制高光点
        ctx.fillStyle = chInfo.color;
        for (let imgY = 0; imgY < h; imgY += rowStep) {
          const idx = (imgY * w + imgX) * 4;
          if (imgData[idx + 3] < 128) continue;

          const val = imgData[idx + chInfo.byteIdx];
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;

          const yPos = baseY - (val / 255) * usableH;
          ctx.fillRect(plotX, yPos, 1.8 * dpr, 1.8 * dpr);
        }

        // 绘制垂直能量包络线，使波形连续完整
        if (maxVal >= minVal) {
          ctx.strokeStyle = chInfo.envColor;
          ctx.lineWidth = 1.5 * dpr;
          const topY = baseY - (maxVal / 255) * usableH;
          const btmY = baseY - (minVal / 255) * usableH;
          ctx.beginPath();
          ctx.moveTo(plotX, btmY);
          ctx.lineTo(plotX, topY);
          ctx.stroke();
        }
      }
    });
  }

  // ----------------------------------------
  // 统一绘制与自适应生命周期
  // ----------------------------------------
  function drawAll() {
    drawHistogram();
    drawVectorscope();
    drawParade();
  }

  // 1. 立即执行一次
  drawAll();

  // 2. 动画帧与延时微任务，确保 DOM 布局尺寸已完全计算完毕
  requestAnimationFrame(drawAll);
  setTimeout(drawAll, 60);
  setTimeout(drawAll, 200);

  // 3. ResizeObserver 监听容器自适应
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      drawAll();
    });
    ro.observe(container);
  }
  window.addEventListener('resize', drawAll);
}

// ==========================================
// 4. 视频胶卷缩略图序列 (Filmstrip) 引擎
// ==========================================

/**
 * 为视频提取 7 个时间节点的连续胶卷缩略图
 */
export async function generateVideoFilmstrip(file, mainVideoElement, container) {
  container.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
      <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
        <div class="flex items-center space-x-2">
          <span class="text-xl">🎞️</span>
          <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100">视频时间线胶卷序列 (Timeline Filmstrip)</h4>
        </div>
        <span class="text-xs text-slate-400 font-mono">点击缩略图即可直接定位播放</span>
      </div>

      <!-- 胶卷容器 -->
      <div id="filmstripThumbsContainer" class="flex items-center space-x-3 overflow-x-auto py-2 scrollbar-thin">
        <div class="py-6 text-xs text-slate-400 flex items-center space-x-2">
          <div class="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span>正在智能抓取视频关键节点画面...</span>
        </div>
      </div>
    </div>
  `;

  const thumbsWrapper = container.querySelector('#filmstripThumbsContainer');
  const objectUrl = URL.createObjectURL(file);

  // 创建后台不可见专属抽帧 video 元素，避免干扰主播放器
  const offscreenVideo = document.createElement('video');
  offscreenVideo.muted = true;
  offscreenVideo.playsInline = true;
  offscreenVideo.src = objectUrl;

  await new Promise((resolve, reject) => {
    offscreenVideo.onloadedmetadata = resolve;
    offscreenVideo.onerror = reject;
  });

  const duration = offscreenVideo.duration;
  if (!duration || duration <= 0.1) {
    thumbsWrapper.innerHTML = `<div class="text-xs text-slate-400 py-2">视频时长过短，无需生成胶卷序列</div>`;
    return;
  }

  // 截取 7 处关键节点：5%, 20%, 35%, 50%, 65%, 80%, 95%
  const ratios = [0.05, 0.20, 0.35, 0.50, 0.65, 0.80, 0.95];
  const thumbs = [];

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < ratios.length; i++) {
    const targetTime = duration * ratios[i];
    offscreenVideo.currentTime = targetTime;

    await new Promise((resolve) => {
      const onSeeked = () => {
        offscreenVideo.removeEventListener('seeked', onSeeked);
        resolve();
      };
      offscreenVideo.addEventListener('seeked', onSeeked);
      // 超时保护
      setTimeout(resolve, 800);
    });

    ctx.drawImage(offscreenVideo, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    thumbs.push({ time: targetTime, timeStr: formatTime(targetTime), dataUrl });
  }

  // 释放后台视频对象
  URL.revokeObjectURL(objectUrl);

  // 渲染电影胶卷外观
  thumbsWrapper.innerHTML = thumbs.map((th, idx) => `
    <button class="btn-filmstrip-thumb group flex-shrink-0 flex flex-col items-center rounded-xl p-1.5 bg-slate-900 border border-slate-700/80 hover:border-indigo-500 hover:shadow-lg transition relative overflow-hidden" data-time="${th.time}">
      <div class="w-28 sm:w-32 aspect-video bg-black rounded-lg overflow-hidden relative shadow-inner">
        <img src="${th.dataUrl}" alt="Frame" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
        <span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white font-mono text-[10px] backdrop-blur font-medium">
          ${th.timeStr}
        </span>
      </div>
      <div class="mt-1.5 text-[10px] font-mono text-slate-400 group-hover:text-indigo-400 font-bold transition flex items-center space-x-1">
        <span>#${idx + 1}</span>
        <span>•</span>
        <span>跳转播放</span>
      </div>
    </button>
  `).join('');

  // 绑定点击跳转事件
  thumbsWrapper.querySelectorAll('.btn-filmstrip-thumb').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = parseFloat(btn.getAttribute('data-time'));
      mainVideoElement.currentTime = t;
      mainVideoElement.play().catch(() => {});
    });
  });
}

// ==========================================
// 5. 视频专业实时示波器与运动矢量分析引擎
// ==========================================

/**
 * 挂载广播监视级视频实时示波器与运动矢量分析
 * (亮度波形图 · 实时色彩直方图 · 矢量示波图 · 宏块运动矢量与帧差热力图)
 * @param {HTMLVideoElement} videoElement 视频播放器元素
 * @param {HTMLElement} container 目标挂载容器
 */
export function mountVideoScopes(videoElement, container) {
  if (!videoElement || !container) return;

  // 1. 清理可能存在的旧实例
  if (container._videoScopesCleanup) {
    container._videoScopesCleanup();
    container._videoScopesCleanup = null;
  }

  // 2. 注入专业监视器 UI 骨架
  container.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700">
        <div class="flex items-center space-x-2">
          <span class="text-xl">📺</span>
          <div>
            <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100">视频专业监视示波器与运动矢量分析 (Video Scopes & Motion)</h4>
            <span class="text-[11px] text-slate-400">广播监视级实时示波体系 · 随播放逐帧动态联动 (亮度波形 · 色彩直方 · 矢量示波 · 运动矢量)</span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs font-mono">
          <!-- 实时同步指示器 -->
          <span id="vscopeSyncBadge" class="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
            <span class="status-dot w-2 h-2 rounded-full bg-slate-400"></span>
            <span class="status-text">❚❚ 画面定格</span>
          </span>
          <!-- 运镜动态指数 -->
          <span id="vscopeMotionBadge" class="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 font-semibold">
            动态指数: 0.0
          </span>
          <!-- 曝光溢出检测 -->
          <span id="vscopeExposureBadge" class="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            暗部: 0% · 高光: 0%
          </span>
        </div>
      </div>

      <!-- 4 大专业示波图并列网格 -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- 1. 亮度波形图 (Luma Waveform / 100 IRE) -->
        <div class="bg-slate-950 rounded-xl p-3.5 border border-slate-800 flex flex-col justify-between space-y-2.5">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <span class="text-xs font-bold text-slate-200 flex items-center space-x-1">
              <span>📈</span>
              <span>亮度波形 (Waveform)</span>
            </span>
            <span class="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-900/60">
              100 IRE
            </span>
          </div>

          <div class="relative w-full h-40">
            <canvas id="vscopeWaveformCanvas" class="w-full h-full block rounded-lg"></canvas>
          </div>

          <div class="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5">
            <span>0 IRE (底黑)</span>
            <span>50 (中灰)</span>
            <span>100 IRE (极白)</span>
          </div>
        </div>

        <!-- 2. 实时色彩直方图 (Real-time Histogram) -->
        <div class="bg-slate-950 rounded-xl p-3.5 border border-slate-800 flex flex-col justify-between space-y-2.5">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <span class="text-xs font-bold text-slate-200 flex items-center space-x-1">
              <span>📊</span>
              <span>实时直方图 (Histogram)</span>
            </span>
            <div id="vscopeHistBtns" class="flex items-center space-x-1 text-[9px] font-mono">
              <button class="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold" data-mode="rgb">RGB</button>
              <button class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300" data-mode="y">Y</button>
              <button class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-rose-400" data-mode="r">R</button>
              <button class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400" data-mode="g">G</button>
              <button class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400" data-mode="b">B</button>
            </div>
          </div>

          <div class="relative w-full h-40">
            <canvas id="vscopeHistCanvas" class="w-full h-full block rounded-lg"></canvas>
          </div>

          <div class="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5">
            <span>暗部 0</span>
            <span id="vscopeMeanLumText">均值: -</span>
            <span>高光 255</span>
          </div>
        </div>

        <!-- 3. 矢量示波图 (Vectorscope) -->
        <div class="bg-slate-950 rounded-xl p-3.5 border border-slate-800 flex flex-col justify-between space-y-2.5">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <span class="text-xs font-bold text-slate-200 flex items-center space-x-1">
              <span>🎯</span>
              <span>矢量示波图 (Vectorscope)</span>
            </span>
            <span class="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-900/60">
              肤色线 (Skin)
            </span>
          </div>

          <div class="relative w-full h-40 flex items-center justify-center">
            <canvas id="vscopeVecCanvas" class="h-full aspect-square block"></canvas>
          </div>

          <div class="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5">
            <span>中心: 灰阶</span>
            <span>外环: 100% 饱和</span>
          </div>
        </div>

        <!-- 4. 运动矢量与帧间动态 (Motion Vectors / Optical Flow) -->
        <div class="bg-slate-950 rounded-xl p-3.5 border border-slate-800 flex flex-col justify-between space-y-2.5">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <span class="text-xs font-bold text-slate-200 flex items-center space-x-1">
              <span>🌀</span>
              <span>运动矢量 (Motion)</span>
            </span>
            <div id="vscopeMotionBtns" class="flex items-center space-x-1 text-[9px] font-mono">
              <button class="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold" data-mode="vectors">矢量箭头</button>
              <button class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300" data-mode="heatmap">帧差热力</button>
            </div>
          </div>

          <div class="relative w-full h-40 flex items-center justify-center overflow-hidden">
            <canvas id="vscopeMotionCanvas" class="w-full h-full block rounded-lg"></canvas>
          </div>

          <div class="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5">
            <span id="vscopeMotionTypeText">运镜: 静态</span>
            <span id="vscopeActiveVectorsCount">动态块: 0</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // 3. 获取 DOM 引用
  const vscopeSyncBadge = container.querySelector('#vscopeSyncBadge');
  const vscopeMotionBadge = container.querySelector('#vscopeMotionBadge');
  const vscopeExposureBadge = container.querySelector('#vscopeExposureBadge');
  const vscopeMeanLumText = container.querySelector('#vscopeMeanLumText');
  const vscopeMotionTypeText = container.querySelector('#vscopeMotionTypeText');
  const vscopeActiveVectorsCount = container.querySelector('#vscopeActiveVectorsCount');

  const waveCanvas = container.querySelector('#vscopeWaveformCanvas');
  const histCanvas = container.querySelector('#vscopeHistCanvas');
  const vecCanvas = container.querySelector('#vscopeVecCanvas');
  const motionCanvas = container.querySelector('#vscopeMotionCanvas');

  // 画布尺寸获取
  function getCanvasDims(cvs, fallbackW = 280, fallbackH = 160) {
    const dpr = window.devicePixelRatio || 1;
    const rect = cvs.getBoundingClientRect();
    const parent = cvs.parentElement;
    const pRect = parent ? parent.getBoundingClientRect() : null;
    const rawW = rect.width || cvs.clientWidth || (pRect ? pRect.width : 0) || fallbackW;
    const rawH = rect.height || cvs.clientHeight || (pRect ? pRect.height : 0) || fallbackH;
    const cw = Math.max(120, Math.floor(rawW * dpr));
    const ch = Math.max(100, Math.floor(rawH * dpr));
    cvs.width = cw;
    cvs.height = ch;
    return { cw, ch, dpr };
  }

  // 正方形矢量示波器尺寸获取
  function getSquareDims(cvs, fallbackSize = 160) {
    const dpr = window.devicePixelRatio || 1;
    const parent = cvs.parentElement;
    const pRect = parent ? parent.getBoundingClientRect() : null;
    const rawSize = Math.min(
      (pRect ? pRect.width : 0) || cvs.clientWidth || fallbackSize,
      (pRect ? pRect.height : 0) || cvs.clientHeight || fallbackSize
    );
    const size = Math.max(120, Math.floor(rawSize * dpr));
    cvs.width = size;
    cvs.height = size;
    return { cw: size, ch: size, dpr };
  }

  // 4. 离屏采样画布 (160x90 黄金规格，兼备极高精度与超低 CPU 占用)
  const sampleW = 160;
  const sampleH = 90;
  const offCanvas = document.createElement('canvas');
  offCanvas.width = sampleW;
  offCanvas.height = sampleH;
  const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

  let prevLuma = null;
  let currentHistMode = 'rgb';
  let currentMotionMode = 'vectors';

  // ----------------------------------------
  // 示波 1: 亮度波形图 (Luma Waveform / 100 IRE)
  // ----------------------------------------
  function drawWaveform(imgData, cw, ch, dpr) {
    const ctx = waveCanvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);

    const padTop = 8 * dpr;
    const padBtm = 8 * dpr;
    const usableH = ch - padTop - padBtm;
    const baseY = ch - padBtm;

    // 绘制 IRE 参考网格虚线 (0, 25, 50, 75, 100 IRE)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    [0, 0.25, 0.5, 0.75, 1.0].forEach(r => {
      const y = baseY - r * usableH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 逐列采样绘制水平曝光波形
    const numCols = Math.min(cw, 96);
    const colStep = sampleW / numCols;

    for (let c = 0; c < numCols; c++) {
      const sx = Math.min(sampleW - 1, Math.floor(c * colStep));
      const plotX = (c / (numCols - 1)) * cw;

      let minY = 255, maxY = 0;
      ctx.fillStyle = 'rgba(74, 222, 128, 0.75)'; // 荧光绿波形点

      for (let sy = 0; sy < sampleH; sy += 2) {
        const idx = (sy * sampleW + sx) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        const yVal = 0.299 * r + 0.587 * g + 0.114 * b;

        if (yVal < minY) minY = yVal;
        if (yVal > maxY) maxY = yVal;

        const plotY = baseY - (yVal / 255) * usableH;
        ctx.fillRect(plotX, plotY, 1.6 * dpr, 1.6 * dpr);
      }

      // 绘制垂直能量包络线，形成连续荧光光柱
      if (maxY >= minY) {
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.18)';
        ctx.lineWidth = 1.2 * dpr;
        const topY = baseY - (maxY / 255) * usableH;
        const btmY = baseY - (minY / 255) * usableH;
        ctx.beginPath();
        ctx.moveTo(plotX, btmY);
        ctx.lineTo(plotX, topY);
        ctx.stroke();
      }
    }
  }

  // ----------------------------------------
  // 示波 2: 实时色彩直方图 (Real-time Histogram)
  // ----------------------------------------
  function drawHist(histR, histG, histB, histY, cw, ch, dpr) {
    const ctx = histCanvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);

    let maxVal = 1;
    for (let i = 2; i < 254; i++) {
      if (histR[i] > maxVal) maxVal = histR[i];
      if (histG[i] > maxVal) maxVal = histG[i];
      if (histB[i] > maxVal) maxVal = histB[i];
      if (histY[i] > maxVal) maxVal = histY[i];
    }
    maxVal = maxVal * 1.08;

    // 刻度虚线 (25%, 50%, 75%)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    [0.25, 0.5, 0.75].forEach(r => {
      ctx.beginPath();
      ctx.moveTo(cw * r, 0); ctx.lineTo(cw * r, ch);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, ch * (1 - r)); ctx.lineTo(cw, ch * (1 - r));
      ctx.stroke();
    });
    ctx.setLineDash([]);

    function drawChannel(arr, stroke, fill) {
      ctx.beginPath();
      ctx.moveTo(0, ch);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * cw;
        const v = Math.min(arr[i], maxVal);
        const y = ch - (v / maxVal) * ch;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cw, ch);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.6 * dpr;
      ctx.stroke();
    }

    if (currentHistMode === 'rgb') {
      ctx.globalCompositeOperation = 'screen';
      drawChannel(histR, '#f43f5e', 'rgba(244, 63, 94, 0.45)');
      drawChannel(histG, '#22c55e', 'rgba(34, 197, 94, 0.45)');
      drawChannel(histB, '#3b82f6', 'rgba(59, 130, 246, 0.45)');
      ctx.globalCompositeOperation = 'source-over';
    } else if (currentHistMode === 'y') {
      drawChannel(histY, '#f8fafc', 'rgba(248, 250, 252, 0.35)');
    } else if (currentHistMode === 'r') {
      drawChannel(histR, '#ef4444', 'rgba(239, 68, 68, 0.45)');
    } else if (currentHistMode === 'g') {
      drawChannel(histG, '#22c55e', 'rgba(34, 197, 94, 0.45)');
    } else if (currentHistMode === 'b') {
      drawChannel(histB, '#3b82f6', 'rgba(59, 130, 246, 0.45)');
    }
  }

  // ----------------------------------------
  // 示波 3: 矢量示波图 (Vectorscope)
  // ----------------------------------------
  function drawVec(imgData, cw, ch, dpr) {
    const ctx = vecCanvas.getContext('2d');
    const cx = cw / 2;
    const cy = ch / 2;
    const radius = (Math.min(cw, ch) / 2) * 0.86;
    ctx.clearRect(0, 0, cw, ch);

    // 刻度同心圆环
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1 * dpr;
    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * ratio, 0, Math.PI * 2);
      ctx.stroke();
    });
    // 十字标尺
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // 128 度肤色基准线 (Skin Tone Line)
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
    ctx.lineWidth = 1.4 * dpr;
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    const skinAngle = (128 * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(skinAngle) * radius, cy - Math.sin(skinAngle) * radius);
    ctx.stroke();
    ctx.restore();

    // 6 目标标准色靶框 (75% Saturation)
    const targets = [
      { name: 'R',  cb: -43,  cr: 127,  color: '#ef4444' },
      { name: 'Mg', cb: 84,   cr: 106,  color: '#d946ef' },
      { name: 'B',  cb: 127,  cr: -21,  color: '#3b82f6' },
      { name: 'Cy', cb: 43,   cr: -127, color: '#06b6d4' },
      { name: 'G',  cb: -84,  cr: -106, color: '#22c55e' },
      { name: 'Yl', cb: -127, cr: 21,   color: '#eab308' },
    ];
    targets.forEach(t => {
      const tx = cx + (t.cb / 128) * radius * 0.75;
      const ty = cy - (t.cr / 128) * radius * 0.75;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(tx - 3 * dpr, ty - 3 * dpr, 6 * dpr, 6 * dpr);
      ctx.fillStyle = t.color;
      ctx.font = `bold ${Math.round(7 * dpr)}px monospace`;
      ctx.fillText(t.name, tx + 5 * dpr, ty + 3 * dpr);
    });

    // 像素色度荧光云采样 (步长 12，约 1200 像素，极速且保留真实色相)
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < imgData.length; i += 12) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;

      const px = cx + (cb / 128) * radius;
      const py = cy - (cr / 128) * radius;

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
      ctx.fillRect(px, py, 1.6 * dpr, 1.6 * dpr);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ----------------------------------------
  // 示波 4: 运动矢量图与帧间动态 (Motion Vectors & Optical Flow)
  // ----------------------------------------
  function drawMotion(currLuma, currImgData, cw, ch, dpr) {
    const ctx = motionCanvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);

    if (!prevLuma) {
      // 首帧：渲染暗化视频轮廓底图
      ctx.drawImage(offCanvas, 0, 0, cw, ch);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
      ctx.fillRect(0, 0, cw, ch);
      return { avgMag: 0, activeCount: 0 };
    }

    if (currentMotionMode === 'vectors') {
      // 模式 1: 宏块运动矢量箭头 (Block Matching Motion Vectors)
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.filter = 'grayscale(100%) contrast(120%)';
      ctx.drawImage(offCanvas, 0, 0, cw, ch);
      ctx.restore();

      const blockSize = 16;
      const searchR = 6;
      let totalMag = 0;
      let activeCount = 0;
      const vectors = [];

      const scaleX = cw / sampleW;
      const scaleY = ch / sampleH;

      for (let by = blockSize; by <= sampleH - blockSize * 1.5; by += blockSize) {
        for (let bx = blockSize; bx <= sampleW - blockSize * 1.5; bx += blockSize) {
          // 局部纹理对比度检测 (平坦无纹理区跳过，抑制误判伪影)
          let bMin = 255, bMax = 0;
          for (let py = 0; py < blockSize; py += 4) {
            for (let px = 0; px < blockSize; px += 4) {
              const val = currLuma[(by + py) * sampleW + (bx + px)];
              if (val < bMin) bMin = val;
              if (val > bMax) bMax = val;
            }
          }
          if (bMax - bMin < 15) continue;

          let bestSad = Infinity;
          let bestDx = 0, bestDy = 0;

          for (let dy = -searchR; dy <= searchR; dy += 2) {
            for (let dx = -searchR; dx <= searchR; dx += 2) {
              let sad = 0;
              for (let py = 0; py < blockSize; py += 4) {
                const rowP = (by + py) * sampleW;
                const rowC = (by + py + dy) * sampleW;
                for (let px = 0; px < blockSize; px += 4) {
                  sad += Math.abs(prevLuma[rowP + (bx + px)] - currLuma[rowC + (bx + px + dx)]);
                }
              }
              if (sad < bestSad) {
                bestSad = sad;
                bestDx = dx;
                bestDy = dy;
              }
            }
          }

          const mag = Math.hypot(bestDx, bestDy);
          if (mag >= 1.5) {
            activeCount++;
            totalMag += mag;
            vectors.push({
              x: (bx + blockSize / 2) * scaleX,
              y: (by + blockSize / 2) * scaleY,
              dx: bestDx * scaleX * 2.2,
              dy: bestDy * scaleY * 2.2,
              mag,
            });
          }
        }
      }

      // 绘制运动矢量箭头
      vectors.forEach(v => {
        const tox = v.x + v.dx;
        const toy = v.y + v.dy;
        const color = v.mag > 4 ? '#ef4444' : (v.mag > 2.5 ? '#f59e0b' : '#06b6d4');

        // 起点圆点
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(v.x, v.y, 2 * dpr, 0, Math.PI * 2);
        ctx.fill();

        // 箭头主杆
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8 * dpr;
        ctx.beginPath();
        ctx.moveTo(v.x, v.y);
        ctx.lineTo(tox, toy);
        ctx.stroke();

        // 箭头翼瓣 (Arrow Wings)
        const angle = Math.atan2(v.dy, v.dx);
        const headLen = 6 * dpr;
        ctx.beginPath();
        ctx.moveTo(tox, toy);
        ctx.lineTo(tox - headLen * Math.cos(angle - Math.PI / 6), toy - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(tox, toy);
        ctx.lineTo(tox - headLen * Math.cos(angle + Math.PI / 6), toy - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      });

      const avgMag = activeCount > 0 ? (totalMag / activeCount) : 0;
      return { avgMag, activeCount };

    } else {
      // 模式 2: 帧差动态热力图 (Frame Difference Heatmap)
      const heatImgData = ctx.createImageData(sampleW, sampleH);
      const heatData = heatImgData.data;
      let totalDiff = 0;
      let activeDiffCount = 0;

      for (let i = 0; i < currLuma.length; i++) {
        const diff = Math.abs(currLuma[i] - prevLuma[i]);
        const pIdx = i * 4;
        totalDiff += diff;

        if (diff < 8) {
          heatData[pIdx] = 15;
          heatData[pIdx + 1] = 23;
          heatData[pIdx + 2] = 42;
          heatData[pIdx + 3] = 210;
        } else if (diff < 28) {
          heatData[pIdx] = 6;
          heatData[pIdx + 1] = 182;
          heatData[pIdx + 2] = 212;
          heatData[pIdx + 3] = 230;
          activeDiffCount++;
        } else if (diff < 65) {
          heatData[pIdx] = 245;
          heatData[pIdx + 1] = 158;
          heatData[pIdx + 2] = 11;
          heatData[pIdx + 3] = 240;
          activeDiffCount++;
        } else {
          heatData[pIdx] = 239;
          heatData[pIdx + 1] = 68;
          heatData[pIdx + 2] = 68;
          heatData[pIdx + 3] = 255;
          activeDiffCount++;
        }
      }

      if (!motionCanvas._heatCanvas) {
        motionCanvas._heatCanvas = document.createElement('canvas');
        motionCanvas._heatCanvas.width = sampleW;
        motionCanvas._heatCanvas.height = sampleH;
      }
      motionCanvas._heatCanvas.getContext('2d').putImageData(heatImgData, 0, 0);

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(motionCanvas._heatCanvas, 0, 0, cw, ch);

      const avgDiff = totalDiff / (sampleW * sampleH);
      return { avgMag: avgDiff, activeCount: activeDiffCount };
    }
  }

  // ----------------------------------------
  // 核心单帧分析与全套绘制管线
  // ----------------------------------------
  function processFrame() {
    if (!videoElement || videoElement.readyState < 2) return;

    try {
      offCtx.drawImage(videoElement, 0, 0, sampleW, sampleH);
    } catch (e) {
      return;
    }

    const frameImageData = offCtx.getImageData(0, 0, sampleW, sampleH);
    const data = frameImageData.data;
    const pixelCount = sampleW * sampleH;

    const histR = new Uint32Array(256);
    const histG = new Uint32Array(256);
    const histB = new Uint32Array(256);
    const histY = new Uint32Array(256);
    const currLuma = new Uint8Array(pixelCount);

    let sumY = 0;
    let shadowClip = 0;
    let highlightClip = 0;

    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

      currLuma[i] = y;
      histR[r]++;
      histG[g]++;
      histB[b]++;
      histY[y]++;
      sumY += y;

      if (y <= 3) shadowClip++;
      if (y >= 252) highlightClip++;
    }

    const avgLum = Math.round(sumY / pixelCount);
    const shadowPct = ((shadowClip / pixelCount) * 100).toFixed(1);
    const highlightPct = ((highlightClip / pixelCount) * 100).toFixed(1);

    // 绘制 4 大示波图
    const waveDims = getCanvasDims(waveCanvas);
    drawWaveform(data, waveDims.cw, waveDims.ch, waveDims.dpr);

    const histDims = getCanvasDims(histCanvas);
    drawHist(histR, histG, histB, histY, histDims.cw, histDims.ch, histDims.dpr);

    const vecDims = getSquareDims(vecCanvas);
    drawVec(data, vecDims.cw, vecDims.ch, vecDims.dpr);

    const motionDims = getCanvasDims(motionCanvas);
    const motionRes = drawMotion(currLuma, data, motionDims.cw, motionDims.ch, motionDims.dpr);

    // 更新指标卡
    if (vscopeExposureBadge) {
      vscopeExposureBadge.innerHTML = `暗部: <strong class="${shadowPct > 2 ? 'text-amber-500' : ''}">${shadowPct}%</strong> · 高光: <strong class="${highlightPct > 2 ? 'text-rose-500' : ''}">${highlightPct}%</strong>`;
    }
    if (vscopeMeanLumText) {
      vscopeMeanLumText.innerText = `均值: ${avgLum}`;
    }

    if (vscopeMotionBadge && vscopeMotionTypeText && vscopeActiveVectorsCount) {
      const mag = motionRes.avgMag;
      let motionText = '静态微动';
      let badgeClass = 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
      if (mag > 3.0) {
        motionText = '剧烈运动 / 快速转场';
        badgeClass = 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800';
      } else if (mag > 1.0) {
        motionText = '平稳推拉 / 正常运镜';
        badgeClass = 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-800';
      }
      vscopeMotionBadge.className = `px-2.5 py-1 rounded-full font-semibold ${badgeClass}`;
      vscopeMotionBadge.innerText = `动态指数: ${mag.toFixed(1)}`;
      vscopeMotionTypeText.innerText = `运镜: ${motionText}`;
      vscopeActiveVectorsCount.innerText = `活动向量: ${motionRes.activeCount}`;
    }

    // 缓存当前帧供下一帧对比
    prevLuma = currLuma;
  }

  // ----------------------------------------
  // 动画与播放生命周期循环
  // ----------------------------------------
  let animId = null;
  let lastTime = 0;

  function loop(timestamp) {
    if (videoElement.paused || videoElement.ended) {
      animId = null;
      updateSyncBadge(false);
      return;
    }

    if (!lastTime || timestamp - lastTime >= 40) { // ~24 FPS 极速轻量循环
      lastTime = timestamp;
      processFrame();
    }
    animId = requestAnimationFrame(loop);
  }

  function updateSyncBadge(isPlaying) {
    if (!vscopeSyncBadge) return;
    if (isPlaying) {
      vscopeSyncBadge.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-medium';
      vscopeSyncBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span>● 实时跟踪 24fps</span>';
    } else {
      vscopeSyncBadge.className = 'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium';
      vscopeSyncBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span><span>❚❚ 画面定格</span>';
    }
  }

  const onPlay = () => {
    updateSyncBadge(true);
    if (!animId) animId = requestAnimationFrame(loop);
  };

  const onPause = () => {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    updateSyncBadge(false);
    processFrame();
  };

  const onSeeked = () => {
    processFrame();
  };

  const onTimeUpdate = () => {
    if (videoElement.paused) processFrame();
  };

  const onResize = () => {
    processFrame();
  };

  videoElement.addEventListener('play', onPlay);
  videoElement.addEventListener('pause', onPause);
  videoElement.addEventListener('seeked', onSeeked);
  videoElement.addEventListener('timeupdate', onTimeUpdate);
  window.addEventListener('resize', onResize);

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => processFrame());
    ro.observe(container);
  }

  // 直方图模式切换
  const histBtns = container.querySelectorAll('#vscopeHistBtns button');
  histBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      histBtns.forEach(b => {
        b.className = 'px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300';
      });
      btn.className = 'px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold';
      currentHistMode = btn.getAttribute('data-mode');
      processFrame();
    });
  });

  // 运动分析模式切换
  const motionBtns = container.querySelectorAll('#vscopeMotionBtns button');
  motionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      motionBtns.forEach(b => {
        b.className = 'px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300';
      });
      btn.className = 'px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold';
      currentMotionMode = btn.getAttribute('data-mode');
      processFrame();
    });
  });

  // 初始帧触发
  const triggerInitial = () => {
    processFrame();
    setTimeout(processFrame, 60);
    setTimeout(processFrame, 200);
  };

  if (videoElement.readyState >= 2) {
    triggerInitial();
  } else {
    videoElement.addEventListener('loadeddata', triggerInitial, { once: true });
    videoElement.addEventListener('canplay', triggerInitial, { once: true });
  }

  if (!videoElement.paused) {
    onPlay();
  }

  // 容器绑定注销清理函数
  container._videoScopesCleanup = () => {
    if (animId) cancelAnimationFrame(animId);
    videoElement.removeEventListener('play', onPlay);
    videoElement.removeEventListener('pause', onPause);
    videoElement.removeEventListener('seeked', onSeeked);
    videoElement.removeEventListener('timeupdate', onTimeUpdate);
    window.removeEventListener('resize', onResize);
  };
}

// ==========================================
// 辅助计算工具函数
// ==========================================

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const h = x.toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('').toUpperCase();
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function getColorDescriptiveName(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l <= 12) return '曜黑 / 碳黑';
  if (l >= 90 && s <= 15) return '纯白 / 象牙白';
  if (s <= 12) {
    if (l < 40) return '深灰 / 岩石灰';
    if (l < 70) return '中灰 / 冷灰';
    return '浅灰 / 银白';
  }
  if (h >= 345 || h < 15) return s > 60 ? '艳红 / 绯红' : '砖红 / 珊瑚红';
  if (h >= 15 && h < 45) return s > 60 ? '暖橙 / 琥珀' : '浅赭 / 驼色';
  if (h >= 45 && h < 70) return '金黄 / 柠檬黄';
  if (h >= 70 && h < 160) return s > 50 ? '翠绿 / 碧玉绿' : '橄榄绿 / 苔藓';
  if (h >= 160 && h < 200) return '青碧 / 绿松石';
  if (h >= 200 && h < 260) return s > 50 ? '蔚蓝 / 钴蓝' : '雾霭蓝 / 灰蓝';
  if (h >= 260 && h < 315) return '紫罗兰 / 黛紫';
  return '洋红 / 品红';
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
