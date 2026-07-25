// Mesma forma de objeto que o script.js já espera em PRESTADORES (tags como
// array, horario como {abre, fecha}) — pra minimizar o que muda no front na
// hora de trocar localStorage por fetch(). nota/quantidade vêm de fora (já
// calculados via JOIN na query), não ficam guardados na tabela — mesmo
// princípio de calcularAvaliacaoPrestador() no front: sempre recalculado,
// nunca um número fixo que pode ficar dessincronizado.
// SQL base reaproveitada em qualquer lugar que liste prestadores (busca,
// salvos, "meus cadastros") — LEFT JOIN com avaliações publicadas pra
// trazer a nota já calculada, sem duplicar essa lógica em cada rota.
const SELECT_PRESTADORES_COM_NOTA = `
    SELECT
        p.*,
        COUNT(a.id) AS avaliacoes_quantidade,
        AVG(a.nota) AS avaliacoes_media
    FROM prestadores p
    LEFT JOIN avaliacoes a ON a.prestador_id = p.id AND a.status = 'publicada'
`;

function formatarPrestador(linha) {
    return {
        id: linha.id,
        nome: linha.nome,
        categoria: linha.categoria,
        telefone: linha.telefone,
        cor: linha.cor,
        lat: linha.lat,
        lng: linha.lng,
        tags: JSON.parse(linha.tags),
        horario: { abre: linha.horario_abre, fecha: linha.horario_fecha },
        donoUsuarioId: linha.dono_usuario_id || null,
        nota: {
            quantidade: linha.avaliacoes_quantidade || 0,
            media: linha.avaliacoes_quantidade > 0 ? linha.avaliacoes_media : null
        }
    };
}

module.exports = { formatarPrestador, SELECT_PRESTADORES_COM_NOTA };
