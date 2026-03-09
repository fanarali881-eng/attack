# ترقية نظام الفحص والتحقق - Attack v2

## ملخص التغييرات

### المشكلة السابقة
النظام القديم كان يعاني من مشكلتين رئيسيتين:

1. **فحص الحماية سطحي**: كان يفحص بس Cloudflare وSocket.IO، وحتى كشف Cloudflare كان بسيط (يدور على كلمة "cloudflare" في الهيدرز)
2. **عداد الزوار كاذب**: كان يعتبر أي رد بكود `200` أو `301` أو `302` = "زيارة ناجحة" بدون ما يتحقق إن الزائر فعلاً وصل للمحتوى الحقيقي

---

## الملفات المعدّلة

### 1. `app/api/scan/route.js` - نظام الفحص الجديد (Vercel)

**قبل:** فحص بسيط يشوف الهيدرز ويدور على "cloudflare"
**بعد:** نظام فحص متعدد الطبقات يكشف 12+ نوع حماية

#### أنواع الحماية المدعومة:

| الحماية | الكشف عن طريق |
|---------|---------------|
| Cloudflare | Headers (cf-ray, server) + Cookies (__cf_bm, cf_clearance) + HTML (challenges.cloudflare.com) |
| Akamai Bot Manager | Headers (x-akamai-transformed) + Cookies (_abck, ak_bmsc) |
| PerimeterX / HUMAN | Headers (x-px-) + Cookies (_pxvid, _px2, _px3) + HTML (perimeterx.net) |
| DataDome | Headers (server: datadome) + Cookies (datadome) + HTML (api-js.datadome.co) |
| Imperva / Incapsula | Headers (x-iinfo) + Cookies (visid_incap_, incap_ses_) |
| Sucuri / CloudProxy | Headers (server: sucuri) + Cookies (sucuri_cloudproxy_) |
| AWS WAF / CloudFront | Headers (x-amz-cf-id) + Cookies (aws-waf-token) |
| F5 / Shape Security | Headers (server: bigip) + Cookies (TSPD_101, f5_cspm) |
| Kasada | Headers (x-kpsdk-ct) + Cookies (x-kpsdk-ct) |
| DDoS-Guard | Headers (server: ddos-guard) + Cookies (__ddg1_) |
| Vercel Firewall | Headers (server: vercel, x-vercel-id) |
| StackPath | Headers (server: stackpath) |

#### طبقات الفحص:

1. **Layer 1 - Headers**: فحص كل هيدرز الرد ومقارنتها مع بصمات 12 حماية
2. **Layer 2 - Cookies**: فحص أسماء الكوكيز المرسلة
3. **Layer 3 - HTML Analysis**: فحص محتوى الصفحة عن إشارات الحماية
4. **Layer 4 - Challenge Detection**: تحديد نوع التحدي (JS Challenge, Managed, CAPTCHA, Blocked)
5. **Layer 5 - CAPTCHA Detection**: كشف نوع الكابتشا (Turnstile, reCAPTCHA v2/v3, hCaptcha, AWS)
6. **Layer 6 - Content Verification**: التحقق إن المحتوى حقيقي مو صفحة تحدي

#### مستويات الحماية:

| المستوى | الوصف | نسبة النجاح المتوقعة |
|---------|-------|---------------------|
| none | بدون حماية | 95%+ |
| low | حماية خفيفة (StackPath, Sucuri) | 85-95% |
| medium | حماية متوسطة (Cloudflare JS Challenge) | 60-85% |
| high | حماية قوية (Akamai, CAPTCHA) | 30-60% |
| extreme | حماية شديدة (Blocked, Interactive CAPTCHA) | 10-30% |

#### اختيار الاستراتيجية التلقائي:

- **Socket.IO موجود** → وضع `socketio` (أقوى وضع - يتجاوز كل الحمايات)
- **بدون حماية / حماية خفيفة** → وضع `http` (سريع ومباشر)
- **حماية متوسطة** → وضع `cloudflare` مع curl_cffi
- **حماية قوية** → وضع `cloudflare` مع FlareSolverr + CAPTCHA solver
- **حماية شديدة** → تحذير إن النجاح محدود

---

### 2. `visit.py` - تحسين التحقق من الزوار

**قبل:** دالة `is_cf_blocked()` بسيطة (30 سطر) تفحص بس:
- كود 403/503
- كلمات "just a moment" و "checking your browser"
- حجم الصفحة

**بعد:** دالة `verify_visit_response()` متقدمة تفحص:

#### فحوصات الحظر (Block Detection):
- كود الرد: 403, 503, 429
- 25+ مؤشر حظر (Block Indicators) من كل أنواع الحمايات
- صفحات التحدي الصغيرة مع challenge-platform

#### فحوصات النجاح (Success Verification):
- **عنوان الصفحة**: هل العنوان حقيقي ولا عنوان تحدي؟
- **هيكل HTML**: وجود `<nav>`, `<header>`, `<footer>`, `<main>`, `<article>`
- **حجم المحتوى**: صفحات التحدي عادة أقل من 5KB
- **الروابط والصور**: الصفحات الحقيقية فيها روابط وصور كثيرة
- **SPA Detection**: كشف تطبيقات React/Next.js/Vue

#### نظام النقاط:
- 3+ نقاط = **محتوى حقيقي مؤكد**
- 1+ نقاط + حجم > 2KB = **محتوى حقيقي محتمل**
- أقل من ذلك = **مشكوك فيه**

---

### 3. عدادات جديدة في `visit.py`

| العداد | الوصف |
|--------|-------|
| `active_visitors` | عدد الزوار النشطين (كما كان) |
| `verified_visitors` | **جديد** - عدد الزوار اللي تم التحقق إنهم وصلوا للمحتوى الحقيقي |
| `blocked_visitors` | **جديد** - عدد الزوار اللي انحظروا من الحماية |
| `peak_verified` | **جديد** - أعلى عدد زوار متحققين في نفس الوقت |

---

### 4. `detection_engine.py` - محرك الكشف للسيرفرات (Python)

ملف جديد يحتوي على نفس منطق الكشف المتقدم لكن بلغة Python، عشان السيرفرات تقدر تستخدمه مباشرة لو احتاجت تعيد الفحص.

---

## كيف تستخدم النظام الجديد

1. **الفحص**: لما تحط رابط وتضغط "فحص"، النظام الجديد يرجع لك:
   - اسم الحماية المكتشفة
   - مستوى الحماية (none/low/medium/high/extreme)
   - نوع التحدي (js_challenge/managed/captcha/blocked)
   - نوع الكابتشا لو موجودة
   - هل المحتوى الحقيقي وصل ولا لا
   - الاستراتيجية الموصى بها
   - نسبة النجاح المتوقعة

2. **أثناء الهجوم**: تشوف عدادين:
   - `active_visitors`: كل الزوار النشطين
   - `verified_visitors`: بس الزوار اللي فعلاً وصلوا (الرقم الحقيقي)
   - `blocked_visitors`: الزوار اللي انحظروا

3. **لو الرقم المتحقق = 0**: معناها الحماية صادة كل الزيارات وما فيه فايدة تكمل
