import express from "express";
import cors from "cors";
import 'dotenv/config'; // Asegúrate de que dotenv esté cargado al inicio

// Importa el módulo completo como un objeto de namespace
import * as MercadoPagoModule from 'mercadopago';

// Accedemos a las clases necesarias desde el módulo importado para v2 del SDK
const MercadoPagoConfig = MercadoPagoModule.default.default; // Para la configuración global
const Preference = MercadoPagoModule.Preference;             // Para el servicio de preferencias

// 1. Validar la variable de entorno al inicio
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
// Asegúrate de que esta variable de entorno también esté definida para las back_urls
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

console.log("--- DEPURACIÓN DE SERVIDOR ---");
console.log("Valor de MP_ACCESS_TOKEN (parcial):", MP_ACCESS_TOKEN ? MP_ACCESS_TOKEN.substring(0, 10) + '...' : 'NO DEFINIDO');
console.log("Valor de BASE_URL cargado:", BASE_URL);
console.log("-------------------------------");

if (!MP_ACCESS_TOKEN) {
  console.error("ERROR FATAL: MP_ACCESS_TOKEN no está definido en las variables de entorno. Por favor, configúralo en tu archivo .env");
  process.exit(1); // Sale de la aplicación si el token no está
}

// Instancia la configuración global de Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: MP_ACCESS_TOKEN,
  locale: "es-MX",
});

// Instancia el servicio de preferencias, pasándole la configuración del cliente
const preferencesService = new Preference(client);


const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json()); // Middleware para parsear el body de las solicitudes como JSON

app.post("/create_preference", async (req, res) => {
  try {
    const { items } = req.body; // Recoge los ítems del body de la solicitud

    // Validación básica de los ítems recibidos
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Items inválidos: se requiere un array de items no vacío." });
    }

    for (const item of items) {
        if (!item.title || typeof item.title !== 'string' || item.title.trim() === '' ||
            !item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0 ||
            !item.unit_price || typeof item.unit_price !== 'number' || item.unit_price <= 0) {
          return res.status(400).json({ message: `Estructura de item inválida. Cada item debe tener 'title' (string no vacío), 'quantity' (number > 0) y 'unit_price' (number > 0). Item defectuoso: ${JSON.stringify(item)}` });
        }
    }

    // Preparar los datos de la preferencia para Mercado Pago
    const preferenceData = {
      items: items.map(item => ({
        title: item.title,
        quantity: item.quantity,
        unit_price: parseFloat(item.unit_price.toFixed(2)), // Asegura dos decimales
        // Puedes añadir otros campos opcionales como description, picture_url, category_id, etc.
      })),
      back_urls: {
        success: `${BASE_URL}/success`,
        failure: `${BASE_URL}/failure`,
        pending: `${BASE_URL}/pending`,
      },
      // Redirige automáticamente al usuario si el pago es aprobado
      // Es muy recomendable añadir una notification_url (webhook) para produccion
      // notification_url: `${BASE_URL}/api/webhook/mercadopago`,
      // external_reference: "ID_UNICO_DE_TU_ORDEN", // Un ID único para tu orden interna
    };

    console.log("Datos de la preferencia enviados a MP:", JSON.stringify(preferenceData, null, 2));

    // Crea la preferencia de pago usando el servicio de preferencias
    const response = await preferencesService.create({ body: preferenceData });

    console.log("Respuesta exitosa de Mercado Pago (init_point):", response.init_point);
    // console.log("Respuesta completa de Mercado Pago:", JSON.stringify(response, null, 2)); // Descomenta para ver la respuesta completa

    // Envía el init_point al frontend
    res.json({ init_point: response.init_point });

  } catch (error) {
    console.error("Error en /create_preference (servidor):", error); // Log del error completo en el servidor
    let errorMessage = "Error desconocido al procesar la solicitud.";
    let errorDetails = {}; // Objeto para almacenar detalles del error de la API de MP

    // Intenta extraer el mensaje de error y detalles de la respuesta de Mercado Pago
    if (error && typeof error === 'object') {
      if (error.message) {
        errorMessage = error.message;
      }
      if (error.status) {
        errorDetails.status = error.status;
      }
      if (error.cause) {
        errorDetails.cause = error.cause;
      }
      // Si el error viene de la respuesta HTTP (ej. 400 Bad Request de MP)
      if (error.response && error.response.data) {
        errorDetails.apiResponse = error.response.data;
        if (error.response.data.message) {
          errorMessage = error.response.data.message; // Usa el mensaje más específico de la API
        }
      }
    }

    // Envía el error al frontend con detalles
    res.status(500).json({
      message: errorMessage,
      details: errorDetails
    });
  }
});

// Inicia el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});