using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// Убирает пурпурный фон (#FF00FF), меряет фигуру и рисует уменьшенный кадр.
public static class Sprite
{
    static Bitmap Key(string path)
    {
        using (var src = new Bitmap(path))
        {
            // Кадр из нарезки листа уже без фона (прозрачные поля): его не ключуем второй раз.
            if (Image.IsAlphaPixelFormat(src.PixelFormat) && HasTransparency(src))
                return src.Clone(new Rectangle(0, 0, src.Width, src.Height), PixelFormat.Format32bppArgb);
            var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, src.Width, src.Height);
            var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
            var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            var px = new byte[data.Stride * bmp.Height];
            Marshal.Copy(data.Scan0, px, 0, px.Length);
            for (int i = 0; i < px.Length; i += 4)
            {
                double b = px[i], g = px[i + 1], r = px[i + 2];
                double d = (Math.Min(r, b) - g) / 255.0;
                double a = 1 - Math.Max(0, Math.Min(1, (d - 0.35) / 0.5));
                if (a <= 0.01) { px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0; continue; }
                if (a < 1)
                {
                    // Снимаем примесь фона с краёв: цвет = (пиксель - (1-a)*фон) / a.
                    r = (r - (1 - a) * 255) / a; b = (b - (1 - a) * 255) / a; g = g / a;
                    px[i] = (byte)Math.Max(0, Math.Min(255, b));
                    px[i + 1] = (byte)Math.Max(0, Math.Min(255, g));
                    px[i + 2] = (byte)Math.Max(0, Math.Min(255, r));
                }
                px[i + 3] = (byte)(a * 255);
            }
            Marshal.Copy(px, 0, data.Scan0, px.Length);
            bmp.UnlockBits(data);
            return bmp;
        }
    }

    static bool HasTransparency(Bitmap src)
    {
        using (var bmp = src.Clone(new Rectangle(0, 0, src.Width, src.Height), PixelFormat.Format32bppArgb))
        {
            int stride; var px = Pixels(bmp, out stride);
            for (int i = 3; i < px.Length; i += 4) if (px[i] < 255) return true;
            return false;
        }
    }

    // Рамка фигуры, центр корпуса, центр головы и центр ступней: x0 y0 x1 y1 cx headX feetX.
    // По голове кадры одной позы выравниваются без дрожи: руки и ноги её не сдвигают;
    // по ступням — кадры листа, где фигура наклоняется или машет руками, а ноги стоят.
    public static double[] Measure(string path)
    {
        using (var bmp = Key(path))
        {
            int w = bmp.Width, h = bmp.Height;
            var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var px = new byte[data.Stride * h];
            Marshal.Copy(data.Scan0, px, 0, px.Length);
            bmp.UnlockBits(data);
            var rows = new int[h]; var cols = new int[w];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    if (px[y * data.Stride + x * 4 + 3] > 128) { rows[y]++; cols[x]++; }
            int y0 = 0, y1 = h - 1, x0 = 0, x1 = w - 1;
            while (y0 < h - 1 && rows[y0] < 3) y0++;
            while (y1 > 0 && rows[y1] < 3) y1--;
            while (x0 < w - 1 && cols[x0] < 3) x0++;
            while (x1 > 0 && cols[x1] < 3) x1--;
            double sum = 0; long n = 0; int top = y0 + (int)((y1 - y0) * 0.55);
            for (int y = y0; y <= top; y++)
                for (int x = 0; x < w; x++)
                    if (px[y * data.Stride + x * 4 + 3] > 128) { sum += x; n++; }
            double hsum = 0; long hn = 0; int headBottom = y0 + (int)((y1 - y0) * 0.12);
            for (int y = y0; y <= headBottom; y++)
                for (int x = 0; x < w; x++)
                    if (px[y * data.Stride + x * 4 + 3] > 128) { hsum += x; hn++; }
            double fsum = 0; long fn = 0; int feetTop = y1 - Math.Max(2, (int)((y1 - y0) * 0.05));
            for (int y = Math.Max(y0, feetTop); y <= y1; y++)
                for (int x = 0; x < w; x++)
                    if (px[y * data.Stride + x * 4 + 3] > 128) { fsum += x; fn++; }
            double cx = n > 0 ? sum / n : (x0 + x1) / 2.0;
            // Ось корпуса: в каждой строке от плеч до бёдер — середина самого длинного сплошного куска (отставленная
            // рука его не сдвигает), по всем строкам — медиана. ChatGPT рисует ступни в кадрах листа чуть по-разному,
            // а по этой оси тело стоит на месте.
            var mids = new System.Collections.Generic.List<double>();
            int b0 = y0 + (int)((y1 - y0) * 0.30), b1 = y0 + (int)((y1 - y0) * 0.62);
            for (int y = b0; y <= b1; y++)
            {
                int best = 0, run = 0; double mid = -1;
                for (int x = 0; x <= w; x++)
                {
                    if (x < w && px[y * data.Stride + x * 4 + 3] > 128) { run++; continue; }
                    if (run > best) { best = run; mid = x - run / 2.0; }
                    run = 0;
                }
                if (mid >= 0) mids.Add(mid);
            }
            mids.Sort();
            double body = mids.Count > 0 ? mids[mids.Count / 2] : cx;
            return new double[] { x0, y0, x1, y1, cx, hn > 0 ? hsum / hn : cx, fn > 0 ? fsum / fn : (x0 + x1) / 2.0, body };
        }
    }

    // Маска фигуры готового кадра: 1 там, где пиксель непрозрачный.
    static byte[] Mask(string path, out int w, out int h)
    {
        using (var src = new Bitmap(path))
        {
            w = src.Width; h = src.Height;
            var data = src.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var px = new byte[data.Stride * h];
            Marshal.Copy(data.Scan0, px, 0, px.Length);
            src.UnlockBits(data);
            var mask = new byte[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    if (px[y * data.Stride + x * 4 + 3] > 128) mask[y * w + x] = 1;
            return mask;
        }
    }

    // На сколько пикселей фигура кадра сдвинута вбок относительно образца: берётся сдвиг с наибольшим перекрытием.
    // Нижняя половина весит втрое больше: ноги стоят на месте, а руки и голова двигаются.
    public static int AlignX(string refPath, string path, int range)
    {
        int w, h, w2, h2;
        var a = Mask(refPath, out w, out h);
        var b = Mask(path, out w2, out h2);
        if (w != w2 || h != h2) return 0;
        int top = h;
        for (int i = 0; i < a.Length && top == h; i++) if (a[i] != 0) top = i / w;
        int mid = top + (h - top) / 2, best = 0;
        long bestScore = -1;
        for (int d = -range; d <= range; d++)
        {
            long score = 0;
            for (int y = top; y < h; y++)
            {
                int weight = y >= mid ? 3 : 1, n = 0, row = y * w;
                for (int x = Math.Max(0, -d); x < w && x + d < w; x++) n += a[row + x] & b[row + x + d];
                score += n * weight;
            }
            if (score > bestScore || (score == bestScore && Math.Abs(d) < Math.Abs(best))) { bestScore = score; best = d; }
        }
        return best;
    }

    // Сдвигает готовый кадр вбок на целое число пикселей, не пересчитывая картинку.
    public static void ShiftX(string path, int dx)
    {
        if (dx == 0) return;
        byte[] data = System.IO.File.ReadAllBytes(path);
        using (var stream = new System.IO.MemoryStream(data))
        using (var src = new Bitmap(stream))
        using (var dst = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb))
        {
            var from = src.LockBits(new Rectangle(0, 0, src.Width, src.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var to = dst.LockBits(new Rectangle(0, 0, dst.Width, dst.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            var a = new byte[from.Stride * src.Height];
            var c = new byte[to.Stride * dst.Height];
            Marshal.Copy(from.Scan0, a, 0, a.Length);
            for (int y = 0; y < src.Height; y++)
            {
                int left = Math.Max(0, -dx), count = src.Width - Math.Abs(dx);
                if (count > 0) Buffer.BlockCopy(a, y * from.Stride + left * 4, c, y * to.Stride + (left + dx) * 4, count * 4);
            }
            Marshal.Copy(c, 0, to.Scan0, c.Length);
            src.UnlockBits(from);
            dst.UnlockBits(to);
            dst.Save(path, ImageFormat.Png);
        }
    }

    // Огрубляет цвета до `levels` ступеней на канал и прозрачность до 4 ступеней: PNG сжимается в разы.
    public static void Posterize(string path, int levels)
    {
        Bitmap bmp;
        using (var src = new Bitmap(path)) bmp = new Bitmap(src);
        using (bmp)
        {
            var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
            var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            var px = new byte[data.Stride * bmp.Height];
            Marshal.Copy(data.Scan0, px, 0, px.Length);
            double step = 255.0 / (levels - 1);
            for (int i = 0; i < px.Length; i += 4)
            {
                int a = px[i + 3];
                if (a < 40) { px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0; continue; }
                px[i + 3] = (byte)(a > 215 ? 255 : (a / 64) * 64 + 63);
                for (int c = 0; c < 3; c++) px[i + c] = (byte)(Math.Round(px[i + c] / step) * step);
            }
            Marshal.Copy(px, 0, data.Scan0, px.Length);
            bmp.UnlockBits(data);
            bmp.Save(path, ImageFormat.Png);
        }
    }

    internal static byte[] Pixels(Bitmap bmp, out int stride)
    {
        var data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        stride = data.Stride;
        var px = new byte[data.Stride * bmp.Height];
        Marshal.Copy(data.Scan0, px, 0, px.Length);
        bmp.UnlockBits(data);
        return px;
    }

    internal static Bitmap FromPixels(byte[] px, int w, int h)
    {
        var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(px, 0, data.Scan0, px.Length);
        bmp.UnlockBits(data);
        return bmp;
    }

    // Общая палитра пиксель-арта для набора маленьких кадров: k-средних по всем непрозрачным пикселям.
    // Пиксели сначала собираются в гистограмму по 6 бит на канал: точка k-средних — непустая ячейка
    // с весом (сколько в ней пикселей) и средним цветом. У героя ~170 кадров — это миллионы пикселей,
    // а ячеек — десятки тысяч: палитра считается за доли секунды и почти не отличается от точной.
    public static int[] Palette(string[] paths, int k)
    {
        const int bins = 1 << 18;
        var cnt = new long[bins]; var sr = new long[bins]; var sg = new long[bins]; var sb = new long[bins];
        long total = 0;
        foreach (var p in paths)
            using (var bmp = new Bitmap(p))
            {
                int stride; var px = Pixels(bmp, out stride);
                for (int i = 0; i < px.Length; i += 4)
                    if (px[i + 3] > 127)
                    {
                        int r = px[i + 2], g = px[i + 1], b = px[i], j = (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2);
                        cnt[j]++; sr[j] += r; sg[j] += g; sb[j] += b; total++;
                    }
            }
        int n = 0;
        for (int j = 0; j < bins; j++) if (cnt[j] > 0) n++;
        var pr = new double[n]; var pg = new double[n]; var pb = new double[n]; var pw = new double[n]; var cum = new long[n];
        long acc = 0;
        for (int j = 0, q = 0; j < bins; j++)
            if (cnt[j] > 0)
            {
                pr[q] = (double)sr[j] / cnt[j]; pg[q] = (double)sg[j] / cnt[j]; pb[q] = (double)sb[j] / cnt[j];
                pw[q] = cnt[j]; acc += cnt[j]; cum[q] = acc; q++;
            }
        // Начальные центры — k случайных пикселей (как раньше), только берутся через гистограмму.
        var rnd = new Random(7);
        var c = new double[k, 3];
        for (int j = 0; j < k; j++)
        {
            long t = (long)(rnd.NextDouble() * total);
            int lo = 0, hi = n - 1;
            while (lo < hi) { int mid = (lo + hi) / 2; if (cum[mid] > t) hi = mid; else lo = mid + 1; }
            c[j, 0] = pr[lo]; c[j, 1] = pg[lo]; c[j, 2] = pb[lo];
        }
        var sum = new double[k, 4];
        for (int it = 0; it < 16; it++)
        {
            Array.Clear(sum, 0, sum.Length);
            for (int q = 0; q < n; q++)
            {
                int best = Nearest(c, k, pr[q], pg[q], pb[q]); double wq = pw[q];
                sum[best, 0] += pr[q] * wq; sum[best, 1] += pg[q] * wq; sum[best, 2] += pb[q] * wq; sum[best, 3] += wq;
            }
            for (int j = 0; j < k; j++)
                if (sum[j, 3] > 0) { c[j, 0] = sum[j, 0] / sum[j, 3]; c[j, 1] = sum[j, 1] / sum[j, 3]; c[j, 2] = sum[j, 2] / sum[j, 3]; }
        }
        var pal = new int[k];
        for (int j = 0; j < k; j++) pal[j] = ((int)c[j, 0] << 16) | ((int)c[j, 1] << 8) | (int)c[j, 2];
        return pal;
    }

    static int Nearest(double[,] c, int k, double r, double g, double b)
    {
        int best = 0; double bd = double.MaxValue;
        for (int j = 0; j < k; j++)
        {
            double dr = r - c[j, 0], dg = g - c[j, 1], db = b - c[j, 2], d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
            if (d < bd) { bd = d; best = j; }
        }
        return best;
    }

    // Делает из маленького кадра пиксель-арт: прозрачность да/нет, цвета палитры, тёмный контур снаружи.
    // shift сдвигает всё выше строки split на столько пикселей вниз — вдох в игровой анимации.
    public static void Pixelize(string path, string outPath, int[] pal, int split, int shift, int scale)
    {
        int k = pal.Length; var c = new double[k, 3];
        for (int j = 0; j < k; j++) { c[j, 0] = pal[j] >> 16 & 255; c[j, 1] = pal[j] >> 8 & 255; c[j, 2] = pal[j] & 255; }
        int w, h; byte[] px; int stride;
        using (var bmp = new Bitmap(path)) { w = bmp.Width; h = bmp.Height; px = Pixels(bmp, out stride); }
        var idx = new int[w * h];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                int i = y * stride + x * 4;
                idx[y * w + x] = px[i + 3] > 127 ? Nearest(c, k, px[i + 2], px[i + 1], px[i]) : -1;
            }
        if (shift > 0)
        {
            for (int y = Math.Min(split, h - 1); y >= shift; y--)
                for (int x = 0; x < w; x++) idx[y * w + x] = idx[(y - shift) * w + x];
            for (int y = 0; y < shift; y++)
                for (int x = 0; x < w; x++) idx[y * w + x] = -1;
        }
        // Контур: прозрачный пиксель рядом с непрозрачным становится самым тёмным цветом палитры.
        int dark = 0; double dl = double.MaxValue;
        for (int j = 0; j < k; j++) { double l = c[j, 0] * .3 + c[j, 1] * .59 + c[j, 2] * .11; if (l < dl) { dl = l; dark = j; } }
        var outline = (int[])idx.Clone();
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                if (idx[y * w + x] < 0 &&
                    ((x > 0 && idx[y * w + x - 1] >= 0) || (x < w - 1 && idx[y * w + x + 1] >= 0) ||
                     (y > 0 && idx[(y - 1) * w + x] >= 0) || (y < h - 1 && idx[(y + 1) * w + x] >= 0)))
                    outline[y * w + x] = dark;
        int W = w * scale, H = h * scale; var o = new byte[W * H * 4];
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
            {
                int j = outline[(y / scale) * w + x / scale]; if (j < 0) continue;
                int i = (y * W + x) * 4; int v = pal[j];
                o[i] = (byte)(v & 255); o[i + 1] = (byte)(v >> 8 & 255); o[i + 2] = (byte)(v >> 16 & 255); o[i + 3] = 255;
            }
        using (var dst = FromPixels(o, W, H)) dst.Save(outPath, ImageFormat.Png);
    }

    // Рисует кадр: масштаб s, точка (cx, bottom) исходника попадает в (destX, groundY).
    public static void Render(string path, string outPath, double s, double cx, double bottom, int W, int H, double groundY, double destX)
    {
        using (var bmp = Key(path))
        using (var dst = new Bitmap(W, H, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(dst))
        {
            g.Clear(Color.Transparent);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.CompositingQuality = CompositingQuality.HighQuality;
            float x = (float)(destX - cx * s), y = (float)(groundY - bottom * s);
            g.DrawImage(bmp, x, y, (float)(bmp.Width * s), (float)(bmp.Height * s));
            dst.Save(outPath, ImageFormat.Png);
        }
    }
}

// Режет лист из ChatGPT (сетка rows x cols, по фигуре в ячейке, пурпурный фон) на кадры без фона.
// Кадр — своя ячейка с запасом margin со всех сторон: у всех кадров листа один размер и одна система
// координат (левый верх ячейки — точка (margin, margin)), поэтому привязка «cell» в process-frames
// сохраняет прыжки и сдвиги так, как их нарисовали. В кадр попадает только своя фигура, даже если она
// вылезла за ячейку или сосед стоит вплотную. Не нашлись фигуры ряда — ряд режется просто по сетке.
public static class Sheet
{
    const int Band = 2;          // ширина каймы (px листа), где фигура смешана с фоном
    const double Lo = 40;        // «пурпурность» min(r,b)-g, ниже которой пиксель каймы — целиком фигура
    const double Spill = 32;     // сколько пурпурности оставить пикселю каймы после очистки
    const double Hot = 100;      // пурпурность, с которой пиксель ключуется и внутри фигуры

    public static string Slice(string path, string outDir, int rows, int cols, string[] names)
    {
        int w, h, stride; byte[] px;
        using (var src = new Bitmap(path))
        using (var bmp = src.Clone(new Rectangle(0, 0, src.Width, src.Height), PixelFormat.Format32bppArgb))
        { w = bmp.Width; h = bmp.Height; px = Sprite.Pixels(bmp, out stride); }
        var log = new System.Text.StringBuilder();
        int n = w * h;

        // 1. Цвет фона — медиана пурпурных пикселей листа: ChatGPT даёт не ровный #FF00FF.
        double Br, Bg, Bb;
        BackgroundColor(px, w, h, stride, out Br, out Bg, out Bb);
        double Bmin = Math.Max(1, Math.Min(Br, Bb)), mB = Bmin - Bg;
        if (mB < Lo + 80) { log.AppendFormat("  фон не похож на пурпурный ({0:0},{1:0},{2:0})\n", Br, Bg, Bb); mB = Lo + 80; }

        // 2. «Как фон»: тот же оттенок (r и b высокие и в той же пропорции, g низкий) при любой яркости —
        //    неровный фон, шум и мягкие тени. Розовые волосы (240,150,170) и красное (220,30,50) сюда
        //    не попадают: у них много зелёного или r намного больше b.
        var like = new bool[n];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                int i = y * stride + x * 4; double r = px[i + 2], g = px[i + 1], b = px[i];
                double rn = r * Bmin / Math.Max(1, Br), bn = b * Bmin / Math.Max(1, Bb), s = Math.Min(rn, bn);
                like[y * w + x] = s >= 0.3 * Bmin && g <= Bg + 0.3 * s + 15 && Math.Abs(rn - bn) <= 0.2 * s + 15;
            }

        // 3. Фон — то, что «как фон» и связано с краем листа или с пикселем почти точного цвета фона
        //    (просветы между рукой и телом вместе с их мягкими краями). Пурпурная деталь внутри контура
        //    фигуры без такого пикселя фоном не станет.
        var bg = new bool[n]; var queue = new int[n]; int qh = 0, qt = 0;
        for (int x = 0; x < w; x++) { Seed(like, bg, queue, ref qt, x); Seed(like, bg, queue, ref qt, (h - 1) * w + x); }
        for (int y = 0; y < h; y++) { Seed(like, bg, queue, ref qt, y * w); Seed(like, bg, queue, ref qt, y * w + w - 1); }
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                int i = y * stride + x * 4;
                double dr = px[i + 2] - Br, dg = px[i + 1] - Bg, db = px[i] - Bb;
                if (dr * dr + dg * dg + db * db <= 60 * 60) Seed(like, bg, queue, ref qt, y * w + x);
            }
        while (qh < qt)
        {
            int p = queue[qh++], x = p % w, y = p / w;
            if (x > 0) Seed(like, bg, queue, ref qt, p - 1);
            if (x < w - 1) Seed(like, bg, queue, ref qt, p + 1);
            if (y > 0) Seed(like, bg, queue, ref qt, p - w);
            if (y < h - 1) Seed(like, bg, queue, ref qt, p + w);
        }

        // 4. Кайма — пиксели фигуры не дальше Band от фона, плюс ярко-пурпурные (Hot) где угодно: это фон
        //    в крошечных просветах. Под пикселем каймы — цвет фигуры F (ближайшие чистые пиксели глубже каймы):
        //    пиксель = a·F + (1-a)·фон, отсюда прозрачность a и цвет без примеси фона. Если пиксель на эту
        //    смесь не похож (красная деталь у чёрного края) или чистых соседей нет (тонкая прядь) —
        //    a по пурпурности: у фона mB, у фигуры не больше Lo. Остаток пурпура срезается (despill).
        //    Глубже каймы фигура не трогается: розовое и красное остаются как нарисованы.
        var dist = new byte[n];
        for (int p = 0; p < n; p++) dist[p] = bg[p] ? (byte)0 : (byte)255;
        for (int d = 1; d <= Band; d++)
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    int p = y * w + x; if (dist[p] != 255) continue;
                    bool near = false;
                    for (int yy = Math.Max(0, y - 1); yy <= Math.Min(h - 1, y + 1) && !near; yy++)
                        for (int xx = Math.Max(0, x - 1); xx <= Math.Min(w - 1, x + 1); xx++)
                            if (dist[yy * w + xx] == d - 1) { near = true; break; }
                    if (near) dist[p] = (byte)d;
                }
        var alpha = new byte[n];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                int p = y * w + x, i = y * stride + x * 4;
                if (dist[p] == 0) continue;
                double r = px[i + 2], g = px[i + 1], b = px[i];
                if (dist[p] == 255 && Math.Min(r, b) - g < Hot) { alpha[p] = 255; continue; }
                double fr = 0, fg = 0, fb = 0; int fc = 0;
                for (int d = 1; d <= Band + 1 && fc == 0; d++)
                    for (int yy = Math.Max(0, y - d); yy <= Math.Min(h - 1, y + d); yy++)
                        for (int xx = Math.Max(0, x - d); xx <= Math.Min(w - 1, x + d); xx++)
                        {
                            if (Math.Max(Math.Abs(yy - y), Math.Abs(xx - x)) != d || dist[yy * w + xx] != 255) continue;
                            int qi = yy * stride + xx * 4;
                            if (Math.Min(px[qi + 2], px[qi]) - px[qi + 1] >= Hot) continue;
                            fr += px[qi + 2]; fg += px[qi + 1]; fb += px[qi]; fc++;
                        }
                double a = Math.Max(0, Math.Min(1, (mB - (Math.Min(r, b) - g)) / (mB - Lo))), spill = Spill;
                if (fc > 0)
                {
                    fr /= fc; fg /= fc; fb /= fc;
                    double ur = fr - Br, ug = fg - Bg, ub = fb - Bb, len = ur * ur + ug * ug + ub * ub;
                    double vr = r - Br, vg = g - Bg, vb = b - Bb;
                    double t = Math.Max(0, Math.Min(1, (vr * ur + vg * ug + vb * ub) / Math.Max(1, len)));
                    double er = vr - t * ur, eg = vg - t * ug, eb = vb - t * ub;
                    if (len > 60 * 60 && er * er + eg * eg + eb * eb <= 16 * 16) { a = t; spill = Math.Max(Spill, Math.Min(fr, fb) - fg + 8); }
                }
                if (a < 0.06) continue;
                if (a < 1) { r = (r - (1 - a) * Br) / a; g = (g - (1 - a) * Bg) / a; b = (b - (1 - a) * Bb) / a; }
                r = Clamp(r); g = Clamp(g); b = Clamp(b);
                double e = Math.Min(r, b) - g - spill;
                if (e > 0) { r -= e; b -= e; }
                px[i + 2] = (byte)Clamp(r); px[i + 1] = (byte)Clamp(g); px[i] = (byte)Clamp(b);
                alpha[p] = (byte)Math.Round(a * 255);
            }

        // 5. Пятна фигур (связные области, 8 соседей).
        var label = new int[n]; for (int p = 0; p < n; p++) label[p] = -1;
        var area = new System.Collections.Generic.List<long>();
        var sx = new System.Collections.Generic.List<double>(); var sy = new System.Collections.Generic.List<double>();
        var box = new System.Collections.Generic.List<int[]>();
        for (int p0 = 0; p0 < n; p0++)
        {
            if (alpha[p0] == 0 || label[p0] >= 0) continue;
            int id = area.Count; long cnt = 0; double ax = 0, ay = 0; int bx0 = w, by0 = h, bx1 = -1, by1 = -1;
            qh = qt = 0; queue[qt++] = p0; label[p0] = id;
            while (qh < qt)
            {
                int p = queue[qh++], x = p % w, y = p / w;
                cnt++; ax += x; ay += y;
                if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
                for (int yy = Math.Max(0, y - 1); yy <= Math.Min(h - 1, y + 1); yy++)
                    for (int xx = Math.Max(0, x - 1); xx <= Math.Min(w - 1, x + 1); xx++)
                    {
                        int q = yy * w + xx;
                        if (alpha[q] != 0 && label[q] < 0) { label[q] = id; queue[qt++] = q; }
                    }
            }
            area.Add(cnt); sx.Add(ax / cnt); sy.Add(ay / cnt); box.Add(new[] { bx0, by0, bx1, by1 });
        }

        // 6. Крупные пятна — фигуры (ячейка по центру масс), мелкие — к ближайшей фигуре, крошки — прочь.
        int cw = w / cols, ch = h / rows, cells = rows * cols; double cellArea = (double)cw * ch;
        int k = area.Count; var owner = new int[k]; var major = new bool[k];
        for (int j = 0; j < k; j++)
        {
            owner[j] = -1;
            if (area[j] < cellArea * 0.02) continue;
            major[j] = true;
            int c = Math.Min(cols - 1, Math.Max(0, (int)(sx[j] / cw))), r = Math.Min(rows - 1, Math.Max(0, (int)(sy[j] / ch)));
            owner[j] = r * cols + c;
        }
        int dropped = 0;
        for (int j = 0; j < k; j++)
        {
            if (major[j] || area[j] < Math.Max(12, cellArea * 0.0002)) continue;
            double best = double.MaxValue; int to = -1;
            for (int t = 0; t < k; t++)
            {
                if (!major[t]) continue;
                int[] a = box[j], b = box[t];
                double gx = Math.Max(0, Math.Max(a[0] - b[2], b[0] - a[2])), gy = Math.Max(0, Math.Max(a[1] - b[3], b[1] - a[3]));
                double d = Math.Sqrt(gx * gx + gy * gy);
                if (d < best) { best = d; to = t; }
            }
            if (to >= 0 && best <= 0.25 * cw) owner[j] = owner[to]; else dropped++;
        }

        // 7. Проверка по рядам: в каждой названной ячейке должна быть фигура, иначе ряд — по сетке.
        var named = new bool[cells]; var grid = new bool[cells]; var has = new bool[cells];
        for (int j = 0; j < k; j++) if (major[j]) has[owner[j]] = true;
        for (int i = 0; i < cells; i++) named[i] = i < names.Length && names[i] != "" && names[i] != "-";
        for (int r = 0; r < rows; r++)
        {
            int want = 0, found = 0;
            for (int c = 0; c < cols; c++) { int i = r * cols + c; if (named[i]) { want++; if (has[i]) found++; } }
            if (want == 0) continue;
            if (found < want) for (int c = 0; c < cols; c++) grid[r * cols + c] = true;
            log.AppendFormat("  ряд {0}: {1}\n", r + 1, found < want ? string.Format("по сетке (фигур {0} из {1})", found, want) : "по фигурам");
        }

        // 8. Запас: насколько фигуры вылезли за свои ячейки (+6 px), общий на весь лист.
        int margin = 0;
        for (int j = 0; j < k; j++)
        {
            if (owner[j] < 0 || grid[owner[j]] || !named[owner[j]]) continue;
            int r = owner[j] / cols, c = owner[j] % cols; int[] b = box[j];
            margin = Math.Max(margin, Math.Max(Math.Max(c * cw - b[0], b[2] - (c * cw + cw - 1)), Math.Max(r * ch - b[1], b[3] - (r * ch + ch - 1))));
        }
        margin = Math.Max(8, margin + 6);

        // 9. Кадры.
        int W = cw + 2 * margin, H = ch + 2 * margin, made = 0;
        for (int i = 0; i < cells; i++)
        {
            if (!named[i]) continue;
            int r = i / cols, c = i % cols, ox = c * cw - margin, oy = r * ch - margin;
            var o = new byte[W * H * 4];
            for (int v = 0; v < H; v++)
            {
                int y = oy + v; if (y < 0 || y >= h) continue;
                for (int u = 0; u < W; u++)
                {
                    int x = ox + u; if (x < 0 || x >= w) continue;
                    int p = y * w + x; if (alpha[p] == 0 || label[p] < 0) continue;
                    int lj = label[p];
                    bool mine = grid[i]
                        ? x >= c * cw && x < c * cw + cw && y >= r * ch && y < r * ch + ch && owner[lj] >= 0
                        : owner[lj] == i;
                    if (!mine) continue;
                    int si = y * stride + x * 4, di = (v * W + u) * 4;
                    o[di] = px[si]; o[di + 1] = px[si + 1]; o[di + 2] = px[si + 2]; o[di + 3] = alpha[p];
                }
            }
            using (var dst = Sprite.FromPixels(o, W, H)) dst.Save(System.IO.Path.Combine(outDir, names[i] + ".png"), ImageFormat.Png);
            made++;
        }
        return string.Format("{0}: фон {1:0},{2:0},{3:0}; кадров {4}, ячейка {5}x{6} + запас {7} px{8}\n{9}",
            System.IO.Path.GetFileName(path), Br, Bg, Bb, made, cw, ch, margin,
            dropped > 0 ? string.Format("; отброшено пятен вдали от фигур: {0}", dropped) : "", log.ToString().TrimEnd('\n'));
    }

    static void Seed(bool[] like, bool[] bg, int[] queue, ref int qt, int p)
    {
        if (like[p] && !bg[p]) { bg[p] = true; queue[qt++] = p; }
    }

    static double Clamp(double v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

    // Медиана каналов по пурпурным пикселям (каждый 3-й по обеим осям); мало таких — ровный #FF00FF.
    static void BackgroundColor(byte[] px, int w, int h, int stride, out double r, out double g, out double b)
    {
        var hr = new int[256]; var hg = new int[256]; var hb = new int[256]; int cnt = 0;
        for (int y = 0; y < h; y += 3)
            for (int x = 0; x < w; x += 3)
            {
                int i = y * stride + x * 4, R = px[i + 2], G = px[i + 1], B = px[i], m = Math.Min(R, B);
                if (m > 100 && G < 0.3 * m && Math.Abs(R - B) < 0.25 * Math.Max(R, B)) { hr[R]++; hg[G]++; hb[B]++; cnt++; }
            }
        if (cnt < 500) { r = 255; g = 0; b = 255; return; }
        r = Median(hr, cnt); g = Median(hg, cnt); b = Median(hb, cnt);
    }

    static double Median(int[] hist, int cnt)
    {
        int acc = 0;
        for (int v = 0; v < 256; v++) { acc += hist[v]; if (acc * 2 >= cnt) return v; }
        return 255;
    }
}
