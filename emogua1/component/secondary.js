module.exports = (async () => {
	const cga = await require('./wrapper');
	if (cga.GetImmediateDoneWorkState() === 0) cga.SetImmediateDoneWork(true);
	const Secondary = {};
	Secondary.waitWorkResult = (timeout = 3000) => new Promise((resolve, reject) => cga.AsyncWaitWorkingResult((error, result) => setTimeout(() => error ? reject(error) : resolve(result)), timeout));

	const heal = async (skill, name) => {
		cga.StartWork(skill.index, skill.lv - 1);
		const players = await cga.emogua.waitPlayerMenu();
		const index = players.findIndex(p => p.name == name);
		if (typeof index == 'number') {
			cga.PlayerMenuSelect(index);
			await cga.emogua.waitUnitMenu();
			cga.UnitMenuSelect(0);
			return await Secondary.waitWorkResult();
		}
		throw '治疗失败';
	};
	Secondary.healTeam = async () => {
		const skill = cga.GetSkillsInfo().find(s => s.name == '治疗');
		const requireMp = 25 + skill.lv * 5;
		if (skill) {
			for (;;) {
				let healName;
				const playerInfo = cga.GetPlayerInfo();
				if (playerInfo.mp < requireMp) {
					throw 'mp is not enough';
				}
				if (playerInfo.health > 0) {
					healName = playerInfo.name;
				} else {
					const teammate = cga.emogua.getTeammates().find(p => p.injury > 0);
					healName = teammate && teammate.name;
				}
				if (healName) {
					await heal(skill, healName).catch(console.log);
				} else {
					return true;
				}
			}
		}
		throw 'no skill';
	};

	let resultTimeout = 120000;
	const checkResultTimeout = () => {
		if (resultTimeout > 3000 && cga.GetImmediateDoneWorkState() > 1) {
			resultTimeout = 3000;
		}
		return resultTimeout;
	};
	// 魔力不足 reject 其他 resolve
	const assessItems = async (skill, items) => {
		if (items.length > 0) {
			console.log(skill.name);
			for (const item of items) {
				while (cga.GetPlayerInfo().mp >= (item.level * 10)) {
					cga.StartWork(skill.index, 0);
					cga.AssessItem(skill.index, item.pos);
					const result = await Secondary.waitWorkResult(checkResultTimeout()).catch(() => {});
					if (result.success) break;
				}
				if (cga.GetPlayerInfo().mp < (item.level * 10)) {
					throw 'mp is not enough';
				}
			}
		}
	};
	Secondary.repairAll = async () => {
		const skill = cga.GetSkillsInfo().filter(e => e.name.indexOf('修理') >= 0).sort((e1, e2) => e2.lv - e1.lv)[0];
		if (skill) {
			await assessItems(skill, cga.getInventoryItems().filter(eq => {
				if (
					(
						(skill.name == '修理武器' && eq.type >= 0 && eq.type <= 6) ||
						(skill.name == '修理防具' && eq.type >= 7 && eq.type <= 14)
					) && (eq.level <= skill.lv || (eq.level <= 11 && skill.lv == 10))
				) {
					const durability = cga.emogua.getDurability(eq);
					return durability && durability.current < durability.max;
				}
				return false;
			}));
		}
	};
	Secondary.assessAll = async () => {
		const skill = cga.GetSkillsInfo().find(e => e.name == '鉴定');
		if (skill) {
			await assessItems(skill, cga.getInventoryItems().filter(i => !i.assessed && i.level <= skill.lv));
		}
	};
	Secondary.make = async (name) => {
		const requireInfo = cga.getItemCraftInfo(name);
		console.log(requireInfo);
		if (requireInfo) {
			const findJewel = ['制药', '料理'].indexOf(requireInfo.skill.name) < 0;
			const materials = requireInfo.craft.materials;
			let ready = [];
			do {
				const items = cga.getInventoryItems();
				ready = materials.map(m => {
					const item = items.find(i => i.name == m.name && i.count >= m.count);
					m.position = item && item.pos;
					return m;
				}).filter(m => m.position);
				console.log(ready, materials);
				if (ready.length == materials.length) {
					if (cga.GetPlayerInfo().mp >= requireInfo.craft.cost) {
						const positions = [0,0,0,0,0,0];
						if (findJewel) {
							const jewel = items.find(i => i.type == 38 && i.assessed);
							if (jewel) positions[5] = jewel.pos;
						}
						checkResultTimeout();
						cga.StartWork(requireInfo.skill.index, requireInfo.craft.index);
						cga.CraftItem(requireInfo.skill.index, requireInfo.craft.index, 0, positions);
						const result = await Secondary.waitWorkResult(resultTimeout);
						if (result.success) {
							await cga.emogua.sortItems();
						} else {
							throw '背包满了';
						}
					} else {
						throw 'mp is not enough';
					}
				}
			} while (ready.length == materials.length);
		}
	};
	// list: [{index: 0, count: 20}]
	Secondary.exchange = async (target, list) => {
		await cga.emogua.talkNpc(target)(s => s.exchangeGenerator(list));
		await cga.emogua.sortItems(true);
	};
	/**
	 * 建立摊位
	 * arrive
	 *   抵达目的地async
	 * orientation
	 * pets
	 *   [{name,position,orientation}]
	 */
	Secondary.setBooth = async ({arrive, orientation, pets = []}) => {
		if (arrive) {
			await arrive();
			const arrivePosition = cga.GetMapXY();
			let moved = false;
			for (const pet of pets) {
				const match = cga.GetPetsInfo().find(p => p.state != cga.PET_STATE_REST && (p.name == pet.name || p.realname == pet.name));
				if (match) {
					await cga.emogua.walkTo(pet.position);
					await cga.emogua.turnOrientation(pet.orientation);
					await cga.emogua.delay(300);
					cga.ChangePetState(match.index, cga.PET_STATE_REST);
					moved = true;
				}
			}
			if (moved) {
				await cga.emogua.walkTo([arrivePosition.x, arrivePosition.y]);
			}
			cga.turnOrientation(orientation);
		}
	};

	return Secondary;
})();
