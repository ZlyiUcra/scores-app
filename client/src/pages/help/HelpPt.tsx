/** Portuguese body of the user guide. Keep the section structure in sync with
 * HelpEn/HelpUa when editing. */
export function HelpPt({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
      <section className="card">
        <h3>O que é este site</h3>
        <p>
          Um placar ao vivo de um torneio de futebol local: fase de grupos seguida de
          eliminatórias. Tudo se atualiza em tempo real - resultados, classificações e o
          bracket mudam em todos os ecrãs no momento em que um administrador regista um
          golo. Nunca é preciso recarregar a página.
        </p>
        <p>
          As contas têm dois perfis: os <strong>espectadores</strong> veem tudo em modo de
          leitura; os <strong>administradores</strong> também registam resultados. Criar
          uma conta nova cria sempre um espectador. Os botões EN / UA / PT no cabeçalho
          mudam o idioma da interface a qualquer momento.
        </p>
      </section>

      <section className="card">
        <h3>Torneios</h3>
        <p>
          O site acolhe muitos torneios ao longo do tempo. A página «Torneios» lista-os
          todos: o que se joga agora, o que está previsto (com datas) e os anteriores. Um
          torneio terminado fica disponível como arquivo em modo de leitura - os
          resultados, as tabelas e o bracket ficam exatamente como acabaram.
        </p>
      </section>

      <section className="card">
        <h3>Overview</h3>
        <p>
          A página inicial mostra uma tabela por grupo. As tabelas são <em>ao vivo</em>:
          um jogo em curso conta com o resultado atual, por isso cada golo reordena a
          classificação de imediato (um 0:0 acabado de começar conta como empate
          provisório).
        </p>
        <ul>
          <li>
            As equipas ordenam-se por pontos, depois vitórias, diferença de golos e golos
            marcados; se tudo estiver igual, decide o confronto direto.
          </li>
          <li>
            Um marcador <span className="help__mark help__mark--green">verde</span>{' '}
            significa que a posição se apura automaticamente; um marcador{' '}
            <span className="help__mark help__mark--blue">azul</span> significa que essa
            posição é disputada entre grupos pelas vagas restantes.
          </li>
          <li>
            Quando uma posição é disputada, uma tabela extra (por exemplo, «Melhores 3ºs»)
            ordena as suas equipas entre todos os grupos; passam as primeiras linhas
            destacadas a verde.
          </li>
        </ul>
      </section>

      <section className="card">
        <h3>Resultados</h3>
        <p>
          Todos os jogos de grupo com hora, campo e resultado. Um selo vermelho marca os
          jogos ao vivo neste momento. Clique num jogo para abrir a sua página com um
          placar grande{isAdmin ? ' e, para administradores, os controlos de resultado' : ''}.
        </p>
      </section>

      <section className="card">
        <h3>Eliminatórias</h3>
        <p>
          O bracket comporta a maior potência de dois abaixo do número de equipas, por
          isso a fase de grupos elimina sempre alguém: 35 equipas dão um bracket de 32
          (3 ficam de fora) e 16 equipas exatas dão um bracket de 8. As posições
          apuram-se por ordem - todos os 1ºs, todos os 2ºs, e assim por diante - e as
          últimas vagas decidem-se entre as equipas de uma única posição de grupos
          diferentes.
        </p>
        <ul>
          <li>
            Os confrontos da primeira ronda mantêm separadas as equipas do mesmo grupo
            sempre que possível; um duelo do mesmo grupo só acontece quando um grupo
            fornece mais de metade do bracket.
          </li>
          <li>
            Enquanto os grupos ainda se jogam, os nomes entre parênteses - como
            «Cabeça 1 (FC Lions)» - são uma projeção ao vivo da classificação atual. Os
            parênteses desaparecem quando o confronto fica definitivo.
          </li>
          <li>
            O mesmo vale para as rondas seguintes: «Vencedor QF1 (FC Lions)» mostra quem
            está à frente num jogo por terminar; um jogo empatado não projeta nada.
          </li>
          <li>Um jogo eliminatório empatado decide-se nas grandes penalidades.</li>
          <li>Clique em qualquer cartão do bracket para abrir a página desse jogo.</li>
        </ul>
      </section>

      <section className="card">
        <h3>Equipas</h3>
        <p>
          Escolha uma equipa para ver o plantel: nomes, números e posições dos jogadores.
          O seletor agrupa as equipas pelo seu grupo - toque no título de um grupo para o
          abrir ou fechar; as equipas sem grupo aparecem em "Sem grupo".
        </p>
      </section>

      {isAdmin && (
        <>
          <section className="card">
            <h3>Administração: conduzir um jogo</h3>
            <ul>
              <li>
                Abra o jogo (nos Resultados ou num cartão do bracket) e use{' '}
                <strong>+ golo</strong> / <strong>-</strong> em cada lado. Marcar golo num
                jogo agendado inicia-o automaticamente; <strong>Iniciar</strong> faz o
                mesmo sem golo.
              </li>
              <li>
                <strong>Final</strong> termina o jogo. Um jogo eliminatório empatado não
                termina enquanto não houver um resultado decisivo de penáltis - os botões
                de penáltis aparecem sempre que o resultado está empatado.
              </li>
              <li>
                <strong>Repor</strong> congela o jogo de volta a agendado e MANTÉM o
                resultado, que continua editável; só uma reposição a 0:0 limpa também os
                penáltis. Os espectadores continuam a ver o resultado congelado.
              </li>
              <li>
                Num jogo eliminatório, os dois seletores permitem fixar manualmente
                qualquer equipa num dos lados (walkover, desqualificação); «Auto» devolve
                o participante automático. <strong>Repor eliminatórias</strong> na página
                do bracket limpa todos os resultados eliminatórios de uma vez.
              </li>
            </ul>
          </section>

          <section className="card">
            <h3>Administração: montar o torneio</h3>
            <ul>
              <li>
                <strong>Admin - Torneios</strong>: crie torneios com antecedência (nome,
                datas previstas, estado). O estado «terminado» transforma o torneio num
                arquivo - qualquer alteração dentro dele é rejeitada até voltar a pô-lo «a
                decorrer». Só um torneio vazio pode ser eliminado, e nunca o último.
              </li>
              <li>
                O seletor de torneio no topo das páginas de administração define que
                torneio os Jogos e os Plantéis editam - assim um torneio previsto pode ser
                totalmente preparado antes de começar.
              </li>
              <li>
                <strong>Admin - Jogos</strong>: crie grupos e equipas; uma equipa pode
                entrar num grupo ao ser criada ou mais tarde, mas apenas enquanto não tem
                jogos. Um grupo tem no máximo cinco equipas (e precisa de pelo menos duas
                para se jogar); quando está cheio, deixa de aparecer na lista de escolha de
                grupo ao adicionar ou mover uma equipa. O botão «Jogos (n)» gera os jogos em
                falta (todos contra todos) com
                horas provisórias - as horas e o campo editam-se na própria tabela.
              </li>
              <li>
                Assim que existe um resultado eliminatório ou uma fixação manual, os
                grupos, as equipas e os jogos de grupo ficam bloqueados; «Repor
                eliminatórias» desbloqueia-os.
              </li>
              <li>
                <strong>Admin - Plantéis</strong>: listas de jogadores por equipa (nome,
                número opcional - único dentro da equipa - e posição).
              </li>
              <li>
                <strong>Admin - Utilizadores</strong>: promover/despromover, desativar ou
                eliminar contas. Desativar corta de imediato a ligação ao vivo do
                utilizador.
              </li>
              <li>As mensagens de erro aparecem sempre na secção a que dizem respeito.</li>
            </ul>
          </section>
        </>
      )}
    </>
  );
}
