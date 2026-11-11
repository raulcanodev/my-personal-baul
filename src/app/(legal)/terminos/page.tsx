import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos de uso · Baúl",
  description:
    "Condiciones de acceso y uso de Baúl y de sus conexiones bancarias.",
  alternates: { canonical: "https://baul.raulcano.dev/terminos" },
};

export default function TermsPage() {
  return (
    <>
      <h1>Términos de uso</h1>
      <p className="text-muted-foreground text-sm">
        Última actualización: 11 de noviembre de 2026.
      </p>
      <section>
        <h2>1. Servicio y titular</h2>
        <p>
          Baúl es una herramienta de organización financiera gestionada por Raúl
          Marco Cano, disponible en baul.raulcano.dev. Puedes contactar en{" "}
          <a href="mailto:raul@zenex.dev">raul@zenex.dev</a>.
        </p>
        <p>
          Permite consultar y organizar cuentas, movimientos, presupuestos,
          deudas y previsiones. Baúl no es un banco, no custodia fondos, no
          ejecuta pagos ni ofrece asesoramiento financiero, fiscal o de
          inversión personalizado.
        </p>
      </section>
      <section>
        <h2>2. Cuenta y uso permitido</h2>
        <p>
          El acceso está sujeto a la disponibilidad del registro o a una
          invitación. Facilita datos correctos, protege tu contraseña y utiliza
          únicamente información y cuentas para las que tengas autorización. No
          compartas credenciales, accedas a datos ajenos, eludas restricciones
          de acceso ni utilices el servicio para actividades ilícitas o que
          perjudiquen su funcionamiento.
        </p>
        <p>
          Comunica cualquier acceso no autorizado al correo de contacto. El
          acceso podrá limitarse para contener un incidente, un uso abusivo o
          una infracción de estas condiciones, informándote cuando sea posible y
          no comprometa la seguridad.
        </p>
      </section>
      <section>
        <h2>3. Conexiones bancarias</h2>
        <p>
          Las conexiones importan información de cuentas, saldos y movimientos
          para su consulta. Debes configurar los permisos mínimos necesarios y
          respetar las condiciones de cada banco o proveedor. Baúl no solicita
          la contraseña de acceso a tu banca electrónica: las integraciones
          disponibles utilizan credenciales API o, cuando corresponda, el
          proceso de autorización del proveedor.
        </p>
        <p>
          Enable Banking está pendiente de integración y activación. Su registro
          no garantiza disponibilidad para todos los bancos o usuarios. El modo
          restringido está sujeto a sus límites para cuentas propias y uso
          permitido; el acceso de terceros requiere las condiciones y
          habilitaciones correspondientes de Enable Banking. Estos términos no
          sustituyen ni amplían sus permisos o acuerdos.
        </p>
        <p>
          La disponibilidad, el historial y la frecuencia de actualización
          dependen de cada proveedor. Una desconexión detiene la sincronización,
          pero no elimina los movimientos ya importados. Puedes revocar las
          credenciales o el consentimiento directamente en el proveedor.
        </p>
      </section>
      <section>
        <h2>4. Agentes y aplicaciones autorizadas</h2>
        <p>
          Al conectar una aplicación externa, revisa los permisos solicitados.
          El acceso de lectura permite consultar información y el de escritura
          permite modificar datos de Baúl. Las acciones de estos agentes no
          equivalen a operaciones bancarias. Puedes revocar su acceso desde los
          ajustes de agentes.
        </p>
      </section>
      <section>
        <h2>5. Exactitud y disponibilidad</h2>
        <p>
          Los datos importados pueden llegar con retraso o contener errores. Las
          previsiones son estimaciones basadas en la información disponible.
          Contrasta los importes con tu banco y revisa los resultados antes de
          tomar decisiones.
        </p>
        <p>
          Baúl es un proyecto en evolución; puede experimentar interrupciones
          por mantenimiento, incidencias o cambios de proveedores. No se
          garantiza disponibilidad ininterrumpida ni resultados financieros
          concretos. Esto no excluye responsabilidades ni derechos que la
          legislación aplicable haga irrenunciables.
        </p>
      </section>
      <section>
        <h2>6. Coste y servicios de terceros</h2>
        <p>
          Baúl no incorpora actualmente un sistema de cobro por su uso. Los
          bancos o proveedores externos pueden aplicar sus propias tarifas
          conforme a los acuerdos que suscribas con ellos. Cualquier futura
          oferta de pago de Baúl se comunicará con sus condiciones y requerirá
          aceptación antes de cobrar.
        </p>
      </section>
      <section>
        <h2>7. Privacidad y cierre</h2>
        <p>
          El tratamiento de los datos se explica en la{" "}
          <Link href="/privacidad">política de privacidad</Link>. Puedes
          exportar tu información desde los ajustes y solicitar el cierre de tu
          cuenta y la eliminación de datos escribiendo a raul@zenex.dev.
        </p>
      </section>
      <section>
        <h2>8. Cambios y resolución de incidencias</h2>
        <p>
          Las modificaciones relevantes de estas condiciones se comunicarán
          antes de su aplicación. Si requieren una nueva aceptación, se
          solicitará expresamente. Puedes dejar de usar el servicio y solicitar
          el cierre de tu cuenta.
        </p>
        <p>
          Para consultas o reclamaciones, contacta primero con raul@zenex.dev.
          Se aplicará la legislación española sin perjuicio de las normas
          imperativas y de los derechos y tribunales que correspondan a los
          consumidores según su residencia.
        </p>
      </section>
    </>
  );
}
