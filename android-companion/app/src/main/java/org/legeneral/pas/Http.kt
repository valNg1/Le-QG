package org.legeneral.pas

import java.net.HttpURLConnection
import java.net.URL

data class HttpResult(val code: Int, val body: String) {
    val ok: Boolean get() = code in 200..299
}

/** Client HTTP minimal (HttpURLConnection) : aucune dépendance tierce. */
object Http {
    fun post(
        url: String,
        body: String,
        contentType: String = "application/json",
        headers: Map<String, String> = emptyMap(),
    ): HttpResult {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", contentType)
            headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return HttpResult(code, text)
        } finally {
            conn.disconnect()
        }
    }
}
