import type { HideoutRecipe } from '../../entities/hideout/types'
import { recipeBatchOutputForPrimaryItem } from './recipeBatchOutput'

/**
 * Ключ устойчив к admin-override количества результата: bench + энергия + основной предмет + набор ингредиентов.
 */
export function duplicateRecipeStructuralKey(recipe: HideoutRecipe): string | null {
  const batch = recipeBatchOutputForPrimaryItem(recipe)
  if (!batch) return null
  const ing = [...recipe.ingredients]
    .filter((i) => i.amount > 0)
    .map((i) => `${i.item}:${i.amount}`)
    .sort()
    .join(',')
  return `${recipe.bench}|${recipe.energy}|${batch.primaryItemId}|${ing}`
}

/** Понятные имена для взаимозаменяемых рецептов (global DB, май 2026). */
const DUPLICATE_CRAFT_LABEL_BY_STRUCTURAL_KEY: Record<string, string> = {
  'laboratory_table|1200|1r216|4npn:1,lynkj:3,p62q6:3,prrd:10,rw1mg:3': '«ТОПОТ» (Теломераза)',
  'laboratory_table|1200|1r216|6w59j:5,lynkj:3,p62q6:3,prrd:10,rw1mg:3': '«ТОПОТ» (УДАР)',
  'laboratory_table|400|4nkr|404p:1,ll6q:1,qvv4:5': 'Алюминиевый порошок (Минералы)',
  'laboratory_table|200|4nkr|404p:1,np0w:2,ov50:1': 'Алюминиевый порошок (Сковорода)',
  'laboratory_table|200|4nkr|404p:1,np0w:2,npz3:1': 'Алюминиевый порошок (Кастрюля)',
  'laboratory_table|1100|z2y2|1rl71:30,4npn:10,dqn9:30,w77z:15,w7ro:10': 'Аномальные гены (Теломераза)',
  'laboratory_table|1100|z2y2|4k3qo:2,prrd:50,y770:10': 'Аномальные гены (Лимбоплазма)',
  'workbench|0|401j|77ov6:4,wo6z:1': 'Батарея холодного синтеза (Квантовые батареи)',
  'workbench|0|401j|9d1qy:1,wo6z:1': 'Батарея холодного синтеза (Аномальные батареи)',
  'workbench|0|401j|gn975:1,wo6z:5': 'Батарея холодного синтеза (Квантовый генератор)',
  'laboratory_table|100|klq0|3rpg:4': 'Биогаз (Рыба)',
  'laboratory_table|100|klq0|40vn:2,vrpd:5': 'Биогаз (Шавка)',
  'laboratory_table|100|klq0|40vn:2,dq0n:5': 'Биогаз (Хрюша)',
  'laboratory_table|100|klq0|2d76:5,40vn:2': 'Биогаз (Кабан)',
  'workbench|200|rwow5|pry2:1': 'Бутылка чистой воды (Энергия)',
  'kitchen_table|100|rwow5|m22k:10,pry2:5': 'Бутылка чистой воды (Водонос)',
  'workbench|400|03p1|jl77:5,klq0:2': 'Газовый баллон (Биогаз)',
  'workbench|400|03p1|jl77:5,y263:2': 'Газовый баллон (Метан)',
  'kitchen_table|1100|y39yz|404p:1,p6056:4,rwow5:4,z7y2:4': 'Гороховый суп (Овощи)',
  'kitchen_table|1100|y39yz|404p:1,p6056:4,rwow5:3,wj2no:2': 'Гороховый суп (Галеты)',
  'workbench|300|z2om|5n51:1,9mgw:1,w732:1': 'Дымный порох (Уголь)',
  'workbench|300|z2om|009n9:1,5n51:2,w732:2': 'Дымный порох (Срачник)',
  'laboratory_table|100|jl77|dq2n:2,y7po:2': 'Железо (Мультитул)',
  'laboratory_table|100|jl77|55olq:1,y7po:5': 'Железо (Остатки приборов)',
  'laboratory_table|100|jl77|2d56:1,y7po:4': 'Железо (Набор болтов)',
  'kitchen_table|100|dqg5|2d76:1': 'Животный жир (Кабан)',
  'kitchen_table|100|dqg5|dq0n:1': 'Животный жир (Хрюша)',
  'kitchen_table|100|dqg5|vrpd:1': 'Животный жир (Шавка)',
  'workbench|200|jl66|03p1:1,rr45:1,z7pn:3': 'Защитное снаряжение (Асбест)',
  'workbench|200|jl66|404p:10,gnpr5:1,z7pn:5': 'Защитное снаряжение (Лимб)',
  'laboratory_table|100|rr7g|kllj:10,y7po:5': 'Медь (Минералы)',
  'laboratory_table|100|rr7g|olz36:2,y7po:2': 'Медь (Моток медной проволоки)',
  'workbench|100|40lp|19on2:5,77w9j:5,9d3gy:5,g05g:2': 'Микроэлектроника (Резонатор)',
  'workbench|100|40lp|77oy6:5': 'Микроэлектроника (Остатки сигнального процессора)',
  'workbench|600|v25p|40lp:6,5dm4:2,5njq:5,mm4y:3,z7m9:3': 'Операционный усилитель (Мультиметр)',
  'workbench|600|v25p|9dk7y:3': 'Операционный усилитель (Пси-маячок)',
  'laboratory_table|100|vr1n|2d76:1': 'Плазма крови (Кабан)',
  'laboratory_table|100|vr1n|vrpd:1': 'Плазма крови (Шавка)',
  'laboratory_table|100|vr1n|dq0n:1': 'Плазма крови (Хрюша)',
  'workbench|100|pry2|jl26:1': 'Пластиковая бутылка (Полимеры)',
  'workbench|100|pry2|rwow5:1': 'Пластиковая бутылка (Бутылка чистой воды)',
  'workbench|100|jl26|m22k:10,pry2:5': 'Полимеры (Пластиковая бутылка)',
  'workbench|100|jl26|5lo3o:5': 'Полимеры (Копыто кабана)',
  'workbench|600|mm4y|035r:2,40lp:3,ll11:3,z719:5': 'Продвинутый электрод (Сталь)',
  'workbench|600|mm4y|55olq:5': 'Продвинутый электрод (Остатки приборов)',
  'laboratory_table|100|prm6|w3923:1,wopo:1': 'Свинец (Сменный аккумулятор)',
  'laboratory_table|100|prm6|55621:1,wopo:2,y7po:2': 'Свинец (Армейский аккумулятор)',
  'laboratory_table|300|z719|jl77:3,qv76:1': 'Сталь (Железо)',
  'laboratory_table|200|z719|404p:1,5dkg:2,dj92:1': 'Сталь (Набор ножей)',
  'laboratory_table|100|404p|5logg:1,w39k3:1': 'Термическая смесь (Артефактный фрагмент)',
  'laboratory_table|100|404p|009n9:1,y7po:1': 'Термическая смесь (Срачник)',
  'workbench|6000|yj0k|2nw5:5,5njq:5,jl26:10,om6m:4,q2yj:10': 'Химический реактор (Полимеры)',
  'workbench|7000|yj0k|jl66:1,mmmk:1,p3o4:1,p3vw:1,v25p:1': 'Химический реактор (Сосуд)',
  'laboratory_table|100|wodp|5logg:1,w39k3:1': 'Электросмесь (Артефактный фрагмент)',
  'laboratory_table|100|wodp|gn976:1,y7po:1': 'Электросмесь (Вещество 07270)',
}

export function getDuplicateCraftDisplayLabel(recipe: HideoutRecipe): string | null {
  const k = duplicateRecipeStructuralKey(recipe)
  if (!k) return null
  return DUPLICATE_CRAFT_LABEL_BY_STRUCTURAL_KEY[k] ?? null
}
