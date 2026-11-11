import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad · Baúl",
  description:
    "Cómo Baúl trata tus datos personales y financieros y cómo ejercer tus derechos.",
  alternates: { canonical: "https://baul.raulcano.dev/privacidad" },
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <p className="text-muted-foreground text-sm">
        Última actualización: 11 de noviembre de 2026.
      </p>
      <section>
        <h2>1. Responsable y contacto</h2>
        <p>
          Raúl Marco Cano es el responsable del tratamiento de los datos en
          Baúl, disponible en baul.raulcano.dev. Para consultas sobre privacidad
          o para ejercer tus derechos, escribe a{" "}
          <a href="mailto:raul@zenex.dev">raul@zenex.dev</a>.
        </p>
      </section>
      <section>
        <h2>2. Datos y procedencia</h2>
        <ul>
          <li>
            Datos que facilitas al registrarte: nombre de usuario, nombre,
            correo electrónico y contraseña, que se almacena mediante una
            función de hash.
          </li>
          <li>
            Datos financieros que introduces o que se obtienen del proveedor que
            conectas: identificadores de cuentas, divisas, saldos, movimientos,
            conceptos, contrapartes y datos originales de las operaciones.
            También categorías, notas, suscripciones, deudas, presupuestos,
            objetivos y previsiones.
          </li>
          <li>
            Credenciales de integración que configuras, como tokens API y claves
            de firma, almacenadas cifradas en el servidor para sincronizar las
            cuentas.
          </li>
          <li>
            Datos técnicos de acceso y seguridad: sesiones, dirección IP,
            navegador, autorizaciones de aplicaciones y registros de
            funcionamiento o errores.
          </li>
        </ul>
        <p>
          Los datos proceden de ti, de los bancos o proveedores que autorizas y
          de tu interacción con Baúl. Evita introducir información sensible
          innecesaria en conceptos o notas.
        </p>
      </section>
      <section>
        <h2>3. Finalidades y bases del tratamiento</h2>
        <p>
          La gestión de tu cuenta, el almacenamiento y la presentación de tus
          finanzas, las exportaciones y las funciones que solicitas se realizan
          para prestarte el servicio. Las conexiones bancarias y las
          aplicaciones externas son opcionales y requieren tu autorización
          específica; puedes dejar de utilizarlas sin cerrar tu cuenta.
        </p>
        <p>
          La seguridad, la prevención de accesos indebidos y la resolución de
          incidencias responden al interés legítimo de proteger el servicio y a
          sus usuarios. También se atenderán las obligaciones legales
          aplicables. Cuando un tratamiento requiera consentimiento, podrás
          retirarlo sin afectar a la licitud del tratamiento anterior.
        </p>
        <p>
          Baúl calcula resúmenes y previsiones para tu consulta; no adopta
          decisiones automatizadas con efectos jurídicos o similares sobre ti,
          ni usa tus datos para publicidad.
        </p>
      </section>
      <section>
        <h2>4. Proveedores y conexiones externas</h2>
        <p>
          Cloudflare proporciona el alojamiento, la base de datos y servicios
          técnicos, y puede tratar datos para prestar esa infraestructura. Su
          red y sus proveedores pueden implicar tratamiento fuera del Espacio
          Económico Europeo. Las garantías aplicables, incluidas las cláusulas
          contractuales tipo cuando procedan, se describen en su{" "}
          <a href="https://www.cloudflare.com/cloudflare-customer-dpa/">
            acuerdo de tratamiento de datos
          </a>
          ; puedes solicitar más información al contacto indicado.
        </p>
        <p>
          Wise y Mercury intervienen cuando conectas una cuenta de esos
          proveedores. Cuando autorices una conexión con Enable Banking, Enable
          Banking Oy y la entidad seleccionada intervendrán en el acceso a la
          información de cuenta. Se aplicarán también los avisos y condiciones
          que se presenten en ese proceso, incluida la{" "}
          <a href="https://enablebanking.com/privacy">
            política de privacidad de Enable Banking
          </a>
          .
        </p>
        <p>
          Si autorizas un agente o aplicación externa mediante el conector de
          Baúl, podrá consultar datos y, si concedes permisos de escritura,
          modificar registros en Baúl. Los datos que reciba quedarán también
          sujetos a su política de privacidad. Puedes revocar esa autorización
          desde los ajustes de agentes; la revocación no borra las copias que el
          tercero ya haya recibido.
        </p>
        <p>
          Los datos no se venden. El administrador puede acceder a ellos cuando
          sea necesario para mantener el servicio, atender una solicitud o
          resolver una incidencia. También podrán comunicarse cuando exista una
          obligación legal.
        </p>
      </section>
      <section>
        <h2>5. Conservación, desconexión y eliminación</h2>
        <p>
          Los datos de tu cuenta y tu historial se conservan mientras mantengas
          la cuenta para que puedas consultar y organizar tus finanzas. Al
          eliminar una conexión bancaria se eliminan sus credenciales de Baúl y
          cesa su sincronización, pero las cuentas y movimientos importados
          permanecen como historial manual. Revoca también el token o
          consentimiento en el proveedor si quieres invalidar el acceso en
          origen.
        </p>
        <p>
          Puedes exportar tus datos desde Ajustes → Exportar datos. Para
          solicitar el cierre de la cuenta y la eliminación de los datos,
          escribe a raul@zenex.dev. Solo se conservarán los datos que deban
          mantenerse por obligaciones legales o para atender responsabilidades,
          durante los plazos aplicables. Los registros técnicos se conservan
          según las necesidades de seguridad y diagnóstico y las opciones de
          retención del proveedor; las copias de recuperación pueden subsistir
          hasta su rotación.
        </p>
      </section>
      <section>
        <h2>6. Cookies y almacenamiento local</h2>
        <p>
          Baúl utiliza cookies necesarias para mantener la sesión y gestionar la
          autenticación. Las sesiones tienen una duración configurada de 30
          días. También guarda preferencias de interfaz, como el tema o la
          ocultación de importes, en el navegador. No incorpora cookies
          publicitarias. Puedes eliminar cookies y almacenamiento desde el
          navegador; hacerlo puede cerrar la sesión o restablecer tus
          preferencias.
        </p>
      </section>
      <section>
        <h2>7. Tus derechos</h2>
        <p>
          Puedes solicitar acceso, rectificación, supresión, portabilidad,
          limitación u oposición al tratamiento, cuando correspondan,
          escribiendo a <a href="mailto:raul@zenex.dev">raul@zenex.dev</a>.
          Indica tu cuenta y tu solicitud; solo se pedirá información adicional
          de identidad cuando sea necesaria para verificarla. La respuesta se
          facilitará, con carácter general, en un mes, con las ampliaciones
          legalmente previstas.
        </p>
        <p>
          También puedes presentar una reclamación ante la{" "}
          <a href="https://www.aepd.es/">
            Agencia Española de Protección de Datos
          </a>
          . Esta política se actualizará si cambia el tratamiento; los cambios
          relevantes se comunicarán antes de aplicarse y se solicitará
          consentimiento cuando sea necesario.
        </p>
      </section>
    </>
  );
}
